package com.github.kusa233.oxype.user

data class User(
    val id: Long,
    val username: String,
    val hashedPassword: String
) {
}
