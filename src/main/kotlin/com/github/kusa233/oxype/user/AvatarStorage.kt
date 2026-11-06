package com.github.kusa233.oxype.user

import java.io.File
import java.security.MessageDigest
import java.util.Base64

/**
 * Files on disk that hold avatars, for both accounts and sessions.
 *
 * An avatar is the one piece of user data that is a picture rather than a value, so it
 * does not live in RocksDB: the record keeps only the file name, and the bytes sit
 * under [DIRECTORY], which is also the folder the HTTP layer serves as `/avatar/...`.
 * That split is what makes the image cacheable as an ordinary static asset while the
 * account and session records stay small.
 *
 * File names carry a content hash. Replacing an avatar therefore produces a different
 * URL, so the browser cannot keep showing the previous picture from its cache and no
 * cache-invalidation header is needed. The hash is truncated to eight hex digits: it
 * is not a security boundary, only a way to rename on change, and the full name is
 * still checked against [FILE_PATTERN] before any path on disk is touched.
 *
 * Accounts and sessions share one folder because they share one URL space, so the
 * name has to say which kind an image belongs to. It does: `u` for an account and `s`
 * for a session, followed by the id. Without that prefix, account 7 and session 7
 * would delete each other's pictures.
 *
 * Formats are restricted to the four the browsers all render, and each one is checked
 * by its own magic bytes rather than by the extension the client claims or the MIME
 * type it sends -- both of those are attacker-controlled, and a file named `.png`
 * that is really an HTML document would be served back to a browser from this origin.
 */
object AvatarStorage {
    /** Folder that holds the images, relative to the process working directory. */
    const val DIRECTORY = "client/avatar"

    /** URL prefix the folder is served under. */
    const val URL_PREFIX = "avatar"

    /** Largest accepted image, after base64 decoding. */
    const val MAX_BYTES = 3 * 1024 * 1024

    /** Longest accepted base64 payload; `MAX_BYTES` grows by 4/3 when encoded. */
    const val MAX_ENCODED_LENGTH = (MAX_BYTES / 3 + 1) * 4

    /** Images are square by design, so one edge length covers every use. */
    const val MAX_EDGE = 4096

    /**
     * Name of a stored file: the kind, the owner id, a hash of the bytes, and the
     * extension that matches the format actually detected. Anything else on disk is
     * never served.
     */
    private val FILE_PATTERN = Regex("^[us][0-9]{1,19}-[0-9a-f]{8}\\.(png|jpg|webp|gif)$")

    /** The two things that can own a picture. The prefix keeps their files apart. */
    enum class Owner(val prefix: String) {
        USER("u"),
        SESSION("s")
    }

    /** The formats an avatar may be, identified by the leading bytes of the file. */
    enum class Format(val extension: String, val mimeType: String) {
        PNG("png", "image/png"),
        JPEG("jpg", "image/jpeg"),
        WEBP("webp", "image/webp"),
        GIF("gif", "image/gif")
    }

    /** A validated image, ready to be written. */
    class Accepted(val format: Format, val bytes: ByteArray)

    /** Why an upload was refused. The message is shown to the user as-is. */
    class Rejected(message: String) : IllegalArgumentException(message)

    /**
     * Decodes and validates an upload.
     *
     * The base64 payload may carry a `data:` URL prefix, which is what the browser's
     * FileReader produces and what the client therefore sends without having to strip
     * it first. A payload without the prefix is accepted too, so the endpoint stays
     * usable from a script.
     *
     * @throws Rejected when the payload is not a base64 image of an accepted format
     */
    fun decode(encoded: String?): Accepted {
        if (encoded == null || encoded.isBlank()) {
            throw Rejected("No image data was sent")
        }

        val payload = stripDataUrlPrefix(encoded.trim())
        if (payload.length > MAX_ENCODED_LENGTH) {
            throw Rejected("The image is larger than ${MAX_BYTES / (1024 * 1024)} MB")
        }

        val bytes = try {
            Base64.getDecoder().decode(payload)
        } catch (e: IllegalArgumentException) {
            throw Rejected("The image data is not valid base64")
        }

        if (bytes.isEmpty()) {
            throw Rejected("No image data was sent")
        }
        if (bytes.size > MAX_BYTES) {
            throw Rejected("The image is larger than ${MAX_BYTES / (1024 * 1024)} MB")
        }

        val format = detect(bytes)
            ?: throw Rejected("The image must be a PNG, JPEG, WebP or GIF file")

        // A size check reports the real limit instead of letting the browser fail to
        // paint a picture the server happily stored.
        val edges = dimensions(bytes, format)
        if (edges != null && (edges.first > MAX_EDGE || edges.second > MAX_EDGE)) {
            throw Rejected("The image must be at most $MAX_EDGE pixels on each side")
        }

        return Accepted(format, bytes)
    }

    /** Removes an optional `data:<mime>;base64,` prefix from an encoded image. */
    private fun stripDataUrlPrefix(value: String): String {
        if (!value.startsWith("data:")) {
            return value
        }
        val comma = value.indexOf(',')
        if (comma == -1) {
            throw Rejected("The image data is not valid base64")
        }
        return value.substring(comma + 1)
    }

    /** Identifies the format from the leading bytes, or null when it is none of them. */
    fun detect(bytes: ByteArray): Format? {
        fun at(index: Int): Int = if (index < bytes.size) bytes[index].toInt() and 0xFF else -1

        if (at(0) == 0x89 && at(1) == 0x50 && at(2) == 0x4E && at(3) == 0x47) {
            return Format.PNG
        }
        if (at(0) == 0xFF && at(1) == 0xD8 && at(2) == 0xFF) {
            return Format.JPEG
        }
        if (at(0) == 0x47 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x38) {
            return Format.GIF
        }
        // RIFF....WEBP: the container is 4 bytes of 'RIFF', a size, then 'WEBP'.
        if (at(0) == 0x52 && at(1) == 0x49 && at(2) == 0x46 && at(3) == 0x46 &&
            at(8) == 0x57 && at(9) == 0x45 && at(10) == 0x42 && at(11) == 0x50
        ) {
            return Format.WEBP
        }
        return null
    }

    /**
     * Reads the pixel dimensions from the header, or returns null when the layout was
     * not recognised.
     *
     * Only used for the size limit, so a format whose header this does not understand
     * is allowed through rather than refused: the magic-byte detection above is what
     * decides whether the file is acceptable at all.
     */
    fun dimensions(bytes: ByteArray, format: Format): Pair<Int, Int>? {
        fun at(index: Int): Int = if (index < bytes.size) bytes[index].toInt() and 0xFF else -1
        fun be32(index: Int): Int? {
            if (index + 3 >= bytes.size) return null
            return (at(index) shl 24) or (at(index + 1) shl 16) or (at(index + 2) shl 8) or at(index + 3)
        }
        fun le16(index: Int): Int? {
            if (index + 1 >= bytes.size) return null
            return at(index) or (at(index + 1) shl 8)
        }

        return when (format) {
            Format.PNG ->
                // 8-byte signature, then a 4-byte length, 'IHDR', width, height.
                if (at(12) == 0x49 && at(13) == 0x48 && at(14) == 0x44 && at(15) == 0x52) {
                    val w = be32(16)
                    val h = be32(20)
                    if (w != null && h != null) Pair(w, h) else null
                } else {
                    null
                }

            Format.GIF -> {
                val w = le16(6)
                val h = le16(8)
                if (w != null && h != null) Pair(w, h) else null
            }

            Format.WEBP -> webpDimensions(bytes)

            Format.JPEG -> jpegDimensions(bytes)
        }
    }

    /** WebP stores its size in one of three sub-formats after the 'WEBP' tag. */
    private fun webpDimensions(bytes: ByteArray): Pair<Int, Int>? {
        fun at(index: Int): Int = if (index < bytes.size) bytes[index].toInt() and 0xFF else -1
        fun le16(index: Int): Int? {
            if (index + 1 >= bytes.size) return null
            return at(index) or (at(index + 1) shl 8)
        }
        fun le24(index: Int): Int? {
            if (index + 2 >= bytes.size) return null
            return at(index) or (at(index + 1) shl 8) or (at(index + 2) shl 16)
        }

        return when {
            // 'VP8 ' lossy: 3-byte frame tag, then the 3-byte start code 9d 01 2a.
            at(12) == 0x56 && at(13) == 0x50 && at(14) == 0x38 && at(15) == 0x20 -> {
                val w = le16(26)
                val h = le16(28)
                if (w != null && h != null) Pair(w and 0x3FFF, h and 0x3FFF) else null
            }
            // 'VP8L' lossless: 14 bits of width-1 then 14 bits of height-1, little endian.
            at(12) == 0x56 && at(13) == 0x50 && at(14) == 0x38 && at(15) == 0x4C -> {
                var bits = 0L
                for (i in 0 until 4) bits = bits or ((at(21 + i).toLong() and 0xFF) shl (8 * i))
                Pair(((bits shr 1) and 0x3FFF).toInt() + 1, ((bits shr 15) and 0x3FFF).toInt() + 1)
            }
            // 'VP8X' extended: canvas width-1 and height-1 as 24-bit values.
            at(12) == 0x56 && at(13) == 0x50 && at(14) == 0x38 && at(15) == 0x58 -> {
                val w = le24(24)
                val h = le24(27)
                if (w != null && h != null) Pair(w + 1, h + 1) else null
            }
            else -> null
        }
    }

    /** JPEG walks its segment chain to the frame header that carries the size. */
    private fun jpegDimensions(bytes: ByteArray): Pair<Int, Int>? {
        fun at(index: Int): Int = if (index < bytes.size) bytes[index].toInt() and 0xFF else -1

        var offset = 2 // skip the leading FF D8
        while (offset + 9 < bytes.size) {
            if (at(offset) != 0xFF) {
                offset++
                continue
            }
            val marker = at(offset + 1)
            // Standalone markers carry no length field.
            if (marker == 0xD8 || marker == 0x01 || marker in 0xD0..0xD7) {
                offset += 2
                continue
            }
            val length = (at(offset + 2) shl 8) or at(offset + 3)
            if (length < 2) {
                return null
            }
            // SOF0..SOF15, excluding the four markers that are not frame headers.
            val isFrameHeader = marker in 0xC0..0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC
            if (isFrameHeader) {
                val h = (at(offset + 5) shl 8) or at(offset + 6)
                val w = (at(offset + 7) shl 8) or at(offset + 8)
                return Pair(w, h)
            }
            offset += 2 + length
        }
        return null
    }

    /** The folder, created on first use. */
    fun directory(): File {
        val dir = File(DIRECTORY)
        if (!dir.isDirectory && !dir.mkdirs()) {
            throw IllegalStateException("Could not create the avatar directory at ${dir.absolutePath}")
        }
        return dir
    }

    /**
     * Writes a validated image and returns the name it was stored under.
     *
     * Any previous file of the same owner is removed afterwards so replacing an avatar
     * does not accumulate: the hash in the name means the new write can never collide
     * with the old one, which is what makes deleting after writing safe.
     */
    fun store(owner: Owner, id: Long, image: Accepted): String {
        val dir = directory()
        val name = fileName(owner, id, image.format, image.bytes)
        File(dir, name).writeBytes(image.bytes)
        deleteOthers(owner, id, keep = name)
        return name
    }

    /** Removes every stored image of this owner, silently ignoring absent files. */
    fun removeAll(owner: Owner, id: Long) {
        val dir = File(DIRECTORY)
        if (!dir.isDirectory) return
        dir.listFiles { file -> belongsTo(file.name, owner, id) }
            ?.forEach { it.delete() }
    }

    private fun deleteOthers(owner: Owner, id: Long, keep: String) {
        val dir = File(DIRECTORY)
        if (!dir.isDirectory) return
        dir.listFiles { file -> belongsTo(file.name, owner, id) && file.name != keep }
            ?.forEach { it.delete() }
    }

    /**
     * Whether a file name belongs to this owner.
     *
     * Compares the whole prefix including the separator, so account 7 never matches
     * the files of account 70.
     */
    private fun belongsTo(name: String, owner: Owner, id: Long): Boolean =
        name.startsWith("${owner.prefix}$id-")

    /** The name an image of this content is stored under. */
    fun fileName(owner: Owner, id: Long, format: Format, bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        val hash = digest.take(4).joinToString("") { "%02x".format(it) }
        return "${owner.prefix}$id-$hash.${format.extension}"
    }

    /**
     * The public URL of a stored file, or empty when the record names none.
     *
     * A name that does not match the expected shape yields the empty string rather than
     * a URL: the only way a record can hold such a name is a corrupted store, and the
     * client is better off falling back to an initial than receiving a link that could
     * address something outside the folder.
     */
    fun urlOf(fileName: String?): String {
        val name = fileName?.trim().orEmpty()
        if (name.isEmpty() || !FILE_PATTERN.matches(name)) {
            return ""
        }
        return "/$URL_PREFIX/$name"
    }

    /** The MIME type that belongs to a stored name, for the static asset response. */
    fun mimeTypeOf(fileName: String): String? {
        val ext = fileName.substringAfterLast('.', "")
        return Format.entries.firstOrNull { it.extension == ext }?.mimeType
    }
}
