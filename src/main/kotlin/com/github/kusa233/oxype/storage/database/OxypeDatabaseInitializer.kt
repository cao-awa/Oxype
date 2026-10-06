package com.github.kusa233.oxype.storage.database

import com.github.kusa233.kalmia.rocksdb.db.KalmiaRocksDB

object OxypeDatabaseInitializer {
    fun init(): KalmiaRocksDB {
        return KalmiaRocksDB.open("/data/data.db")
    }
}
