import Dexie from 'dexie'

export const db = new Dexie('StockEasyDB')

db.version(1).stores({
  products: 'id, barcode, name, brand, category_id, is_active, updated_at',
  categories: 'id, name',
  branches: 'id, name',
  inventory: 'id, [product_id+branch_id], product_id, branch_id, updated_at',
  stockMovements: 'id, product_id, branch_id, user_id, type, created_at',
  profiles: 'id, role, branch_id',
  syncQueue: '++id, table, operation, record_id, created_at',
  syncMeta: 'key'
})

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val)
}

/**
 * Add an entry to the sync queue with timestamp
 * @param {string} table 
 * @param {'INSERT'|'UPDATE'|'DELETE'|string} operation 
 * @param {string|number} recordId 
 * @param {object|null} data 
 * @returns {Promise<number>}
 */
export async function addToSyncQueue(table, operation, recordId, data = null) {
  const entry = {
    table,
    operation: (operation || 'INSERT').toUpperCase(),
    record_id: recordId,
    data,
    created_at: new Date().toISOString()
  }
  return await db.syncQueue.add(entry)
}

/**
 * Looks up product by barcode in local DB
 * @param {string} barcode 
 * @returns {Promise<object|null>}
 */
export async function getProductByBarcode(barcode) {
  if (!barcode) return null
  const cleaned = String(barcode).trim()
  const product = await db.products.where('barcode').equals(cleaned).first()
  return product || null
}

/**
 * Gets inventory record for a product (and branch if provided)
 * @param {string} productId 
 * @param {string} [branchId] 
 * @returns {Promise<object|array|null>}
 */
export async function getInventoryForProduct(productId, branchId = null) {
  if (!productId) return null
  if (branchId) {
    const record = await db.inventory
      .where('[product_id+branch_id]')
      .equals([productId, branchId])
      .first()
    return record || null
  }
  return await db.inventory
    .where('product_id')
    .equals(productId)
    .toArray()
}

/**
 * Updates local inventory quantity (increment) + creates stock movement + adds to sync queue
 * @param {string} productId 
 * @param {string} branchId 
 * @param {number} quantity 
 * @param {string} userId 
 * @param {string} [reason='purchase'] 
 * @returns {Promise<{ movement: object, inventory: object }>}
 */
export async function addStockIn(productId, branchId, quantity, userId, reason = 'purchase') {
  const qty = Number(quantity)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive number')
  }

  // Resolve valid branchId
  let targetBranchId = branchId
  if (!isValidUuid(targetBranchId)) {
    const firstBranch = await db.branches.toCollection().first()
    if (firstBranch?.id && isValidUuid(firstBranch.id)) {
      targetBranchId = firstBranch.id
    }
  }

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  return await db.transaction('rw', [db.inventory, db.stockMovements, db.syncQueue], async () => {
    const existing = await db.inventory
      .where('[product_id+branch_id]')
      .equals([productId, targetBranchId])
      .first()

    let updatedInventory
    let operation = 'UPDATE'

    if (existing) {
      updatedInventory = {
        ...existing,
        quantity: (Number(existing.quantity) || 0) + qty,
        updated_at: now
      }
      await db.inventory.put(updatedInventory)
    } else {
      operation = 'INSERT'
      updatedInventory = {
        id: crypto.randomUUID(),
        product_id: productId,
        branch_id: targetBranchId,
        quantity: qty,
        updated_at: now
      }
      await db.inventory.add(updatedInventory)
    }

    const movement = {
      id: movementId,
      product_id: productId,
      branch_id: targetBranchId,
      user_id: isValidUuid(userId) ? userId : null,
      type: 'IN',
      quantity: qty,
      reason: reason || 'purchase',
      created_at: now
    }
    await db.stockMovements.add(movement)

    // Add inventory sync entry
    await db.syncQueue.add({
      table: 'inventory',
      operation,
      record_id: updatedInventory.id,
      data: updatedInventory,
      created_at: now
    })

    // Add movement sync entry
    await db.syncQueue.add({
      table: 'stock_movements',
      operation: 'INSERT',
      record_id: movement.id,
      data: movement,
      created_at: now
    })

    return { movement, inventory: updatedInventory }
  })
}

/**
 * Updates local inventory quantity (decrement, check not below 0) + creates stock movement + adds to sync queue
 * @param {string} productId 
 * @param {string} branchId 
 * @param {number} quantity 
 * @param {string} userId 
 * @param {string} [reason='sale'] 
 * @returns {Promise<{ movement: object, inventory: object }>}
 */
export async function addStockOut(productId, branchId, quantity, userId, reason = 'sale') {
  const qty = Number(quantity)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive number')
  }

  // Resolve valid branchId
  let targetBranchId = branchId
  if (!isValidUuid(targetBranchId)) {
    const firstBranch = await db.branches.toCollection().first()
    if (firstBranch?.id && isValidUuid(firstBranch.id)) {
      targetBranchId = firstBranch.id
    }
  }

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  return await db.transaction('rw', [db.inventory, db.stockMovements, db.syncQueue], async () => {
    const existing = await db.inventory
      .where('[product_id+branch_id]')
      .equals([productId, targetBranchId])
      .first()

    const currentQty = Number(existing?.quantity) || 0
    if (!existing || currentQty < qty) {
      throw new Error(`Insufficient stock. Available: ${currentQty}, requested: ${qty}`)
    }

    const updatedInventory = {
      ...existing,
      quantity: currentQty - qty,
      updated_at: now
    }
    await db.inventory.put(updatedInventory)

    const movement = {
      id: movementId,
      product_id: productId,
      branch_id: targetBranchId,
      user_id: isValidUuid(userId) ? userId : null,
      type: 'OUT',
      quantity: qty,
      reason: reason || 'sale',
      created_at: now
    }
    await db.stockMovements.add(movement)

    // Add inventory sync entry
    await db.syncQueue.add({
      table: 'inventory',
      operation: 'UPDATE',
      record_id: updatedInventory.id,
      data: updatedInventory,
      created_at: now
    })

    // Add movement sync entry
    await db.syncQueue.add({
      table: 'stock_movements',
      operation: 'INSERT',
      record_id: movement.id,
      data: movement,
      created_at: now
    })

    return { movement, inventory: updatedInventory }
  })
}

/**
 * Saves a new product locally + adds to sync queue
 * @param {object} productData 
 * @returns {Promise<object>}
 */
export async function registerProduct(productData) {
  const now = new Date().toISOString()
  const productId = productData.id || crypto.randomUUID()

  const product = {
    id: productId,
    barcode: productData.barcode ? String(productData.barcode).trim() : '',
    name: productData.name ? String(productData.name).trim() : '',
    brand: productData.brand ? String(productData.brand).trim() : '',
    model: productData.model ? String(productData.model).trim() : '',
    category_id: isValidUuid(productData.category_id) ? productData.category_id : null,
    mrp: productData.mrp !== undefined && productData.mrp !== null ? Number(productData.mrp) : (productData.price !== undefined ? Number(productData.price) : 0),
    purchase_price: productData.purchase_price !== undefined && productData.purchase_price !== null ? Number(productData.purchase_price) : (productData.cost_price !== undefined ? Number(productData.cost_price) : 0),
    reorder_level: productData.reorder_level !== undefined && productData.reorder_level !== null ? Number(productData.reorder_level) : (productData.min_stock_level !== undefined ? Number(productData.min_stock_level) : 5),
    is_active: productData.is_active !== undefined ? Boolean(productData.is_active) : true,
    created_at: productData.created_at || now,
    updated_at: now
  }

  return await db.transaction('rw', [db.products, db.inventory, db.syncQueue], async () => {
    await db.products.put(product)

    await db.syncQueue.add({
      table: 'products',
      operation: 'INSERT',
      record_id: product.id,
      data: product,
      created_at: now
    })

    // Optional initial branch inventory
    if (productData.branch_id && productData.initial_quantity !== undefined) {
      let targetBranchId = productData.branch_id
      if (!isValidUuid(targetBranchId)) {
        const firstBranch = await db.branches.toCollection().first()
        if (firstBranch?.id && isValidUuid(firstBranch.id)) {
          targetBranchId = firstBranch.id
        }
      }
      const initialQty = Number(productData.initial_quantity) || 0
      const invRecord = {
        id: crypto.randomUUID(),
        product_id: productId,
        branch_id: targetBranchId,
        quantity: initialQty,
        updated_at: now
      }
      await db.inventory.put(invRecord)
      await db.syncQueue.add({
        table: 'inventory',
        operation: 'INSERT',
        record_id: invRecord.id,
        data: invRecord,
        created_at: now
      })
    }

    return product
  })
}

/**
 * Returns products below reorder level at a branch
 * @param {string} [branchId] 
 * @param {number} [threshold] 
 * @returns {Promise<Array<object>>}
 */
export async function getLowStockItems(branchId = null, threshold = null) {
  let inventoryRecords = []
  if (branchId) {
    inventoryRecords = await db.inventory.where('branch_id').equals(branchId).toArray()
  } else {
    inventoryRecords = await db.inventory.toArray()
  }

  const lowStockRecords = inventoryRecords.filter(inv => {
    const minLevel = (threshold !== null && threshold !== undefined)
      ? Number(threshold)
      : (inv.min_stock_level !== undefined && inv.min_stock_level !== null ? Number(inv.min_stock_level) : 5)
    return (Number(inv.quantity) || 0) <= minLevel
  })

  if (lowStockRecords.length === 0) {
    return []
  }

  const productIds = [...new Set(lowStockRecords.map(r => r.product_id).filter(Boolean))]
  const products = await db.products.where('id').anyOf(productIds).toArray()
  const productMap = new Map(products.map(p => [p.id, p]))

  return lowStockRecords
    .map(inv => {
      const product = productMap.get(inv.product_id)
      if (!product || product.is_active === false) return null
      return {
        ...product,
        inventory_id: inv.id,
        branch_id: inv.branch_id,
        quantity: Number(inv.quantity) || 0,
        reorder_level: product.reorder_level ?? 5,
        inventory: inv
      }
    })
    .filter(Boolean)
}

/**
 * Searches products by name, brand, or barcode (case-insensitive)
 * @param {string} query 
 * @returns {Promise<Array<object>>}
 */
export async function searchProducts(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return await db.products.filter(p => p.is_active !== false).toArray()
  }

  const q = query.toLowerCase().trim()
  return await db.products
    .filter(p => {
      if (p.is_active === false) return false
      const name = (p.name || '').toLowerCase()
      const brand = (p.brand || '').toLowerCase()
      const barcode = (p.barcode || '').toLowerCase()
      return name.includes(q) || brand.includes(q) || barcode.includes(q)
    })
    .toArray()
}

/**
 * Returns dashboard summary statistics
 * @param {string} [branchId] 
 * @returns {Promise<{ totalProducts: number, lowStockCount: number, todayMovementsCount: number, pendingSyncCount: number }>}
 */
export async function getDashboardStats(branchId = null) {
  const [totalProducts, lowStockItems, pendingSyncCount] = await Promise.all([
    db.products.filter(p => p.is_active !== false).count(),
    getLowStockItems(branchId),
    db.syncQueue.count()
  ])

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayIso = startOfToday.toISOString()

  const todayMovementsCount = await db.stockMovements
    .filter(m => {
      const matchesBranch = !branchId || m.branch_id === branchId
      const matchesDate = m.created_at >= todayIso
      return Boolean(matchesBranch && matchesDate)
    })
    .count()

  return {
    totalProducts,
    lowStockCount: lowStockItems.length,
    todayMovementsCount,
    pendingSyncCount
  }
}

export default db
