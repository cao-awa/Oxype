package com.github.kusa233.oxype.hash.password

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object PasswordHasher {

    private const val ALGORITHM = "PBKDF2WithHmacSHA256"
    private const val ITERATIONS = 600_000
    private const val MIN_ITERATIONS = 10_000
    private const val SALT_BYTES = 16
    private const val KEY_BITS = 256
    private const val SEPARATOR = "$"

    private val random = SecureRandom()
    private val encoder: Base64.Encoder = Base64.getEncoder().withoutPadding()
    private val decoder: Base64.Decoder = Base64.getDecoder()

    fun hash(password: String): String {
        return hash(password.toCharArray())
    }

    fun hash(password: CharArray): String {
        val salt = ByteArray(this.SALT_BYTES).also(this.random::nextBytes)
        val hash = pbkdf2(password, salt, this.ITERATIONS, this.KEY_BITS)
        return listOf(
            this.ALGORITHM,
            this.ITERATIONS.toString(),
            this.encoder.encodeToString(salt),
            this.encoder.encodeToString(hash)
        ).joinToString(SEPARATOR)
    }

    fun verify(password: String, stored: String): Boolean {
        return verify(password.toCharArray(), stored)
    }

    fun verify(password: CharArray, stored: String): Boolean {
        return try {
            val parts = stored.split(this.SEPARATOR)
            if (parts.size != 4) return false

            val (algorithm, iterationsText, saltText, hashText) = parts
            if (!algorithm.equals(this.ALGORITHM, ignoreCase = true)) return false

            val iterations = iterationsText.toIntOrNull() ?: return false
            if (iterations < this.MIN_ITERATIONS) return false

            val salt = this.decoder.decode(saltText)
            val expected = this.decoder.decode(hashText)

            val actual = pbkdf2(password, salt, iterations, expected.size * 8)

            MessageDigest.isEqual(expected, actual)
        } catch (e: Exception) {
            false
        }
    }

    private fun pbkdf2(
        password: CharArray,
        salt: ByteArray,
        iterations: Int,
        keyBits: Int
    ): ByteArray {
        val spec = PBEKeySpec(password, salt, iterations, keyBits)
        try {
            return SecretKeyFactory.getInstance(this.ALGORITHM)
                .generateSecret(spec)
                .encoded
        } finally {
            spec.clearPassword()
        }
    }
}