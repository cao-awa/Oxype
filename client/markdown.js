/**
 * Oxype's built-in Markdown renderer.
 *
 * Hand-written and dependency-free on purpose: the repository has no build step and
 * no third-party front-end libraries, and the messages this renders come from other
 * users. Every byte of a message is therefore HTML-escaped *before* any Markdown
 * construct is recognised, and the renderer only ever emits tags drawn from the fixed
 * whitelist below. There is no path that copies user input into the output unescaped,
 * and no `innerHTML` assignment of raw source, so a message cannot inject markup.
 *
 * Supported blocks:  headings (#..######), fenced code, horizontal rules, blockquotes,
 *                    ordered/unordered/nested lists, task list items, paragraphs.
 * Supported inline:  code spans, bold, italic, strikethrough, links, images, autolinks.
 *
 * Deliberate omissions: setext headings (a `---` line is a horizontal rule here) and
 * raw HTML passthrough (by design -- raw HTML is always shown as literal text).
 */
(function (global) {
    'use strict';

    /** Escape sequences that must never survive into the output as markup. */
    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Returns [url] if it is safe to place in an href/src, otherwise null.
     *
     * Absolute URLs are limited to http, https and mailto; anything else -- notably
     * `javascript:` and `data:` -- is refused. Protocol-relative `//host` is refused
     * too because it silently inherits the page scheme. Relative paths and fragments
     * are allowed, which is what makes `/classic/chat.js`-style links work.
     *
     * The caller has already escaped the source, so a quote in a URL arrives as
     * `&quot;` and cannot terminate the attribute it is written into.
     */
    function sanitizeUrl(url) {
        var value = String(url === null || url === undefined ? '' : url).trim();
        if (!value) {
            return null;
        }
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
            if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) {
                return value;
            }
            return null;
        }
        if (value.indexOf('//') === 0) {
            return null;
        }
        if (value.charAt(0) === '#') {
            return value;
        }
        return value;
    }

    /** Renders the inline (within-a-line) constructs of an already escaped string. */
    function renderInline(escaped, depth) {
        var level = depth || 0;
        var text = escaped;
        var stored = [];

        function placeholder(html) {
            stored.push(html);
            return '\u0000' + (stored.length - 1) + '\u0000';
        }

        // Code spans are lifted out first so their contents are never treated as
        // Markdown. The placeholder uses NUL, which is stripped from the source before
        // this point, so a message cannot forge one.
        text = text.replace(/`([^`\n]+)`/g, function (match, code) {
            return placeholder('<code class="md-code-inline">' + code + '</code>');
        });

        // Images before links: the image syntax is the link syntax with a leading '!'.
        // Both are lifted out of the text before the emphasis passes run. Those passes
        // are regex based, so leaving generated `<a ... target="_blank">` markup in the
        // working string let a later `_` in the same line pair up with the underscore
        // in `_blank` and rewrite the attribute into `target="<em>blank"`.
        text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (match, alt, src) {
            var safe = sanitizeUrl(src);
            if (safe === null) {
                return match;
            }
            return placeholder('<img class="md-img" src="' + safe + '" alt="' + alt +
                '" loading="lazy">');
        });

        text = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, function (match, label, href) {
            var safe = sanitizeUrl(href);
            if (safe === null) {
                return match;
            }
            // The label may itself carry emphasis, so it is rendered recursively. A
            // label cannot contain `](`, which bounds the nesting.
            var labelHtml = level < 4 ? renderInline(label, level + 1) : label;
            return placeholder('<a class="md-link" href="' + safe +
                '" target="_blank" rel="noopener noreferrer">' + labelHtml + '</a>');
        });

        // Autolinks arrive as escaped angle brackets.
        text = text.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g, function (match, url) {
            if (sanitizeUrl(url) === null) {
                return match;
            }
            return placeholder('<a class="md-link" href="' + url +
                '" target="_blank" rel="noopener noreferrer">' + url + '</a>');
        });

        // Strong before emphasis, so `**bold**` is not consumed as two italics. Nothing
        // generated by this function is in the string any more, so these can only match
        // the user's own text.
        text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
        text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

        // The `(^|[^\w*])` guard keeps `a * b * c` and snake_case identifiers literal.
        text = text.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1<em>$2</em>');
        text = text.replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '$1<em>$2</em>');

        // Restore in reverse so a stored string that itself contains a placeholder --
        // impossible to forge, but cheap to be certain about -- is resolved first.
        text = text.replace(/\u0000(\d+)\u0000/g, function (match, index) {
            return stored[Number(index)];
        });

        return text;
    }

    /** Escapes then renders inline constructs. */
    function inline(raw) {
        return renderInline(escapeHtml(raw));
    }

    function isBlank(line) {
        return /^\s*$/.test(line);
    }

    function isFence(line) {
        return /^\s*```/.test(line);
    }

    function isHeading(line) {
        return /^\s{0,3}#{1,6}\s+/.test(line);
    }

    function isRule(line) {
        var trimmed = line.trim();
        if (/^\s*$/.test(trimmed)) {
            return false;
        }
        return /^([-*_])(\s*\1){2,}$/.test(trimmed);
    }

    function isQuote(line) {
        return /^\s{0,3}>/.test(line);
    }

    function matchListItem(line) {
        var unordered = /^(\s*)[-*+]\s+(.*)$/.exec(line);
        if (unordered) {
            return {
                indent: unordered[1].replace(/\t/g, '    ').length,
                ordered: false,
                text: unordered[2]
            };
        }
        // The start number is not honoured; lists always render from 1.
        var ordered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
        if (ordered) {
            return {
                indent: ordered[1].replace(/\t/g, '    ').length,
                ordered: true,
                text: ordered[2]
            };
        }
        return null;
    }

    function isListStart(line) {
        return matchListItem(line) !== null;
    }

    /** True when [line] begins a block, so a paragraph must stop before it. */
    function startsBlock(line) {
        return isFence(line) || isHeading(line) || isRule(line) || isQuote(line) || isListStart(line);
    }

    /** Renders a list item's own text, including a leading task-list checkbox. */
    function renderItemText(text) {
        var task = /^\[([ xX])\]\s+([\s\S]*)$/.exec(text);
        if (task) {
            var checked = task[1].toLowerCase() === 'x';
            return '<span class="md-task' + (checked ? ' md-task-done' : '') + '">' +
                (checked ? '\u2611' : '\u2610') + '</span> ' + inline(task[2]);
        }
        return inline(text);
    }

    function renderListNode(node) {
        var tag = node.ordered ? 'ol' : 'ul';
        var className = node.ordered ? 'md-list md-list-ordered' : 'md-list md-list-unordered';
        var html = '<' + tag + ' class="' + className + '">';
        node.items.forEach(function (item) {
            html += '<li>' + renderItemText(item.text);
            item.children.forEach(function (child) {
                html += renderListNode(child);
            });
            html += '</li>';
        });
        return html + '</' + tag + '>';
    }

    function createListNode(ordered, indent) {
        return { ordered: ordered, indent: indent, items: [] };
    }

    /**
     * Builds the list tree(s) from flat entries using their indentation.
     *
     * Returns a list of top-level lists because a change of marker kind at the same
     * depth (`- a` followed by `1. b`) has to start a sibling list rather than silently
     * changing the current one's marker. An entry deeper than the open list becomes a
     * child of the item before it.
     */
    function buildLists(entries) {
        var roots = [];
        var stack = [];

        entries.forEach(function (entry) {
            while (stack.length > 0 && entry.indent < stack[stack.length - 1].indent) {
                stack.pop();
            }

            var top = stack.length > 0 ? stack[stack.length - 1] : null;

            if (top !== null && entry.indent === top.indent && entry.ordered !== top.ordered) {
                stack.pop();
                top = stack.length > 0 ? stack[stack.length - 1] : null;
            }

            if (top !== null && entry.indent > top.indent && top.items.length > 0) {
                var nested = createListNode(entry.ordered, entry.indent);
                top.items[top.items.length - 1].children.push(nested);
                stack.push(nested);
                top = nested;
            } else if (top === null || entry.indent > top.indent) {
                var fresh = createListNode(entry.ordered, entry.indent);
                roots.push(fresh);
                stack.push(fresh);
                top = fresh;
            }

            top.items.push({ text: entry.text, children: [] });
        });

        return roots;
    }

    /** Renders [lines] (the whole document, or a blockquote body) to HTML. */
    function renderBlocks(lines) {
        var html = '';
        var index = 0;

        while (index < lines.length) {
            var line = lines[index];

            if (isBlank(line)) {
                index++;
                continue;
            }

            if (isFence(line)) {
                var language = line.trim().replace(/^```+/, '').trim();
                var code = [];
                index++;
                while (index < lines.length && !isFence(lines[index])) {
                    code.push(lines[index]);
                    index++;
                }
                // Skip the closing fence when there is one.
                if (index < lines.length) {
                    index++;
                }
                var languageClass = /^[A-Za-z0-9_+-]+$/.test(language)
                    ? ' class="md-code md-code-' + language + '"'
                    : ' class="md-code"';
                html += '<pre class="md-pre"><code' + languageClass + '>' +
                    escapeHtml(code.join('\n')) + '</code></pre>';
                continue;
            }

            if (isRule(line)) {
                html += '<hr class="md-hr">';
                index++;
                continue;
            }

            if (isHeading(line)) {
                var heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
                var level = heading[1].length;
                html += '<h' + level + ' class="md-heading md-h' + level + '">' +
                    inline(heading[2]) + '</h' + level + '>';
                index++;
                continue;
            }

            if (isQuote(line)) {
                var quoted = [];
                while (index < lines.length && isQuote(lines[index])) {
                    quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
                    index++;
                }
                html += '<blockquote class="md-quote">' + renderBlocks(quoted) + '</blockquote>';
                continue;
            }

            if (isListStart(line)) {
                var entries = [];
                while (index < lines.length) {
                    var item = matchListItem(lines[index]);
                    if (item === null) {
                        // A lone indented line continues the item before it.
                        if (isBlank(lines[index]) || entries.length === 0) {
                            break;
                        }
                        var continuation = lines[index].trim();
                        if (!continuation) {
                            break;
                        }
                        entries[entries.length - 1].text += ' ' + continuation;
                        index++;
                        continue;
                    }
                    entries.push(item);
                    index++;
                }
                html += buildLists(entries).map(renderListNode).join('');
                continue;
            }

            var paragraph = [];
            while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index])) {
                paragraph.push(lines[index]);
                index++;
            }
            html += '<p class="md-paragraph">' +
                inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>';
        }

        return html;
    }

    /**
     * Renders Markdown [source] to an HTML string of whitelisted tags.
     *
     * A malformed document must never cost the reader the message, so a parse failure
     * degrades to escaped text with its line breaks preserved.
     */
    function toHtml(source) {
        var text = String(source === null || source === undefined ? '' : source)
            .replace(/\r\n?/g, '\n')
            // NUL is the renderer's internal placeholder marker. Removing it from the
            // source means no message can forge one and have it substituted.
            .replace(/\u0000/g, '');
        try {
            return renderBlocks(text.split('\n'));
        } catch (e) {
            return '<p class="md-paragraph">' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
        }
    }

    global.OxypeMarkdown = {
        /** Escape helper, shared so callers render plain text exactly as this does. */
        escapeHtml: escapeHtml,
        /** Reports whether [url] may be used in an href/src. Exposed for testing. */
        sanitizeUrl: sanitizeUrl,
        /** Renders Markdown to HTML built only from whitelisted tags. */
        toHtml: toHtml
    };
}(typeof window !== 'undefined' ? window : this));
