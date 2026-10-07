package com.github.kusa233.oxype.json

import com.github.cao.awa.cason.JSONElement
import com.github.cao.awa.cason.array.JSONArray
import com.github.cao.awa.cason.exception.JSONParseException
import com.github.cao.awa.cason.obj.JSONObject
import com.github.cao.awa.cason.serialize.parser.JSONParser

/**
 * Reads JSON the way [JSONParser] should have.
 *
 * Cason 1.0.35 copies the opening quote of a string into its buffer as soon as the string
 * contains a backslash escape -- the slow path seeds the builder with
 * `appendRange(chars, start, index)` where the fast path would have used `start + 1` -- so
 * every escaped string comes back with a stray leading `"`. A chat message is precisely the
 * kind of payload that contains escapes, because a line break is written `\n`, so entering
 * a second line produced a body starting with a quote that grew by one on every round trip
 * through storage.
 *
 * The fault is in the dependency, and Kalmia ships a byte-identical copy of the class
 * inside its own jar, so reordering the classpath cannot avoid it. Cason's *encoder* is
 * correct -- `{"text":"a\nb"}` is written properly escaped -- so only reading needs
 * replacing. Extending the parser and overriding the one broken method keeps Cason's
 * object, array and number handling, including its BigInteger and BigDecimal fallbacks,
 * and confines the change to string decoding.
 */
class OxypeJsonParser(start: Int, end: Int, isFinal: Boolean) : JSONParser(start, end, isFinal) {
    companion object {
        fun parseObject(input: String): JSONObject = parse(input) as JSONObject

        fun parseArray(input: String): JSONArray = parse(input) as JSONArray

        fun parse(input: String): JSONElement = parse(input.toCharArray())

        fun parse(input: CharArray): JSONElement =
            OxypeJsonParser(0, input.size, true).parseRoot(input)
    }

    /**
     * Parses one top-level value and rejects trailing content, mirroring what
     * [JSONParser.Companion.parse] does with the corrected [parseString].
     */
    fun parseRoot(chars: CharArray): JSONElement {
        val element = parseElement(chars)
        skipWsAndComments(chars)
        if (eof()) {
            return element
        }
        throw JSONParseException("Trailing characters after top-level value, at line $line, column $col")
    }

    /**
     * Decodes a string literal, honouring every escape JSON defines.
     *
     * Unlike the inherited implementation this keeps the opening quote out of the result,
     * understands `\uXXXX` (the inherited one rejects it outright, so a client that escapes
     * non-ASCII -- or an emoji written as a surrogate pair -- was answered with a bare 400),
     * and refuses unescaped control characters.
     */
    override fun parseString(chars: CharArray): String {
        val start = this.index
        if (start >= this.end) {
            throw JSONParseException("Unexpected EOF in string, at line $line, column $col")
        }

        val quote = chars[start]
        if (quote != '"' && quote != '\'') {
            throw JSONParseException("Expected a quote to start a string but got '$quote', at line $line, column $col")
        }

        val end = this.end
        var index = start + 1

        // Fast path: the common case is a string with no escapes at all, which can be
        // sliced straight out of the buffer.
        while (index < end) {
            val current = chars[index]
            if (current == quote) {
                this.col += (index - start) + 1
                this.index = index + 1
                return String(chars, start + 1, index - start - 1)
            }
            if (current == '\\') {
                break
            }
            if (current < ' ') {
                throw JSONParseException("Unescaped control character in string, at line $line, column $col")
            }
            index++
        }

        if (index >= end) {
            throw JSONParseException("Unterminated string, at line $line, column $col")
        }

        // Slow path: an escape was found. Everything before it is copied verbatim, and the
        // copy deliberately begins after the opening quote.
        val builder = StringBuilder(end - start)
        builder.appendRange(chars, start + 1, index)
        this.col += index - start
        this.index = index

        while (true) {
            if (index >= end) {
                throw JSONParseException("Unterminated string, at line $line, column $col")
            }

            val current = chars[index++]

            when {
                current == quote -> {
                    this.col += index - start
                    this.index = index
                    return builder.toString()
                }

                current == '\\' -> {
                    if (index >= end) {
                        throw JSONParseException("Unterminated escape in string, at line $line, column $col")
                    }

                    when (val escaped = chars[index++]) {
                        '"' -> builder.append('"')
                        '\'' -> builder.append('\'')
                        '\\' -> builder.append('\\')
                        '/' -> builder.append('/')
                        'b' -> builder.append('\b')
                        'f' -> builder.append('\u000C')
                        'n' -> builder.append('\n')
                        'r' -> builder.append('\r')
                        't' -> builder.append('\t')
                        'u' -> {
                            if (index + 4 > end) {
                                throw JSONParseException("Truncated unicode escape in string, at line $line, column $col")
                            }
                            var code = 0
                            for (offset in 0 until 4) {
                                val digit = Character.digit(chars[index + offset], 16)
                                if (digit < 0) {
                                    throw JSONParseException(
                                        "Malformed unicode escape in string, at line $line, column $col"
                                    )
                                }
                                code = code * 16 + digit
                            }
                            index += 4
                            // A surrogate pair arrives as two consecutive escapes and is
                            // rebuilt by appending both halves.
                            builder.append(code.toChar())
                        }

                        else -> throw JSONParseException(
                            "Unknown escape \\$escaped, at line $line, column $col"
                        )
                    }
                }

                // A raw line break inside a string would make the payload ambiguous, and
                // other control characters are not legal unescaped in JSON.
                current < ' ' -> throw JSONParseException(
                    "Unescaped control character in string, at line $line, column $col"
                )

                else -> builder.append(current)
            }
        }
    }
}
