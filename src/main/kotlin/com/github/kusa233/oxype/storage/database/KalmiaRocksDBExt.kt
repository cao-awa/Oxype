package com.github.kusa233.oxype.storage.database

import com.github.kusa233.kalmia.rocksdb.db.KalmiaRocksDB

/**
 * Removes a key from the store.
 *
 * The bundled RocksDB wrapper only exposes read and write operators, so the
 * underlying database handle is used directly. Declared here instead of mutating
 * the library class.
 */
fun KalmiaRocksDB.remove(key: ByteArray) {
    this.database.delete(key)
}
