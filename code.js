// =====================
//    UTILITIES
// =====================

// Sort nodes top→bottom then left→right (approx. reading order)
function sortReadingOrder(nodes) {
  return [...nodes].sort((a, b) => {
    const ay = (a && a.y) != null ? a.y : 0
    const by = (b && b.y) != null ? b.y : 0
    if (Math.abs(ay - by) > 4) return ay - by
    const ax = (a && a.x) != null ? a.x : 0
    const bx = (b && b.x) != null ? b.x : 0
    return ax - bx
  })
}

function getSelectedTextNodes() {
  const selected = figma.currentPage.selection
  const textInSelection = []
  for (const node of selected) {
    if (node.type === "TEXT") textInSelection.push(node)
    if (typeof node.findAll === "function") {
      for (const n of node.findAll(n => n.type === "TEXT")) textInSelection.push(n)
    }
  }
  const map = new Map()
  for (const n of textInSelection) map.set(n.id, n)
  return Array.from(map.values())
}

// --- list detection on a raw line ---
// Returns { type: 'ul'|'ol'|null, strip: number }
function classifyListLine(rawLine) {
  const mUL = rawLine.match(/^\s*([\-*•‣–—])\s+/) // dash, bullet, etc.
  if (mUL) return { type: "ul", strip: mUL[0].length }
  const mOL = rawLine.match(/^\s*((?:\d+|[A-Za-z]+)[\.\)])\s+/) // 1.  1)  A.  a)
  if (mOL) return { type: "ol", strip: mOL[0].length }
  return { type: null, strip: 0 }
}

const escapeHTML = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Normalize options from UI
function normalizeOptions(o) {
  return {
    bold: (o && (o.bold === 'strong' || o.bold === 'span' || o.bold === "none")) ? o.bold : 'span',
    em: !!(o && (o.em === true || o.em === 'em')),
    p: !!(o && (o.p === true || o.p === 'p')),
    br: !!(o && (o.br === true || o.br === 'br')),
    links: (o && (o.links === 'same' || o.links === 'newtab')) ? o.links : 'newtab',
    lists: (o && (o.lists === 'regex' || o.lists === 'figma')) ? o.lists : 'figma',
  }
}



function ensureSpaced(inner, wrapper) {
  let result = wrapper(inner)
  if (!/^\s/.test(inner)) result = " " + result
  if (!/\s$/.test(inner)) result = result + " "
  return result
}

function wrapWithTagsPreservingSpaces(text, openTag, closeTag) {
  const leading = (text.match(/^\s*/) || [""])[0]
  const trailing = (text.match(/\s*$/) || [""])[0]
  const core = text.trim()
  if (!core) return text // texte vide ou seulement espace: on ne wrap pas
  return `${leading}${openTag}${core}${closeTag}${trailing}`
}

function wrapEm(text) {
  return wrapWithTagsPreservingSpaces(text, "<em>", "</em>")
}
function wrapStrong(text) {
  return wrapWithTagsPreservingSpaces(text, "<strong>", "</strong>")
}
function wrapBoldSpan(text) {
  return wrapWithTagsPreservingSpaces(text, `<span class=\\"bold\\">`, `</span>`)
}
function wrapLink(text, href, newTab) {
  const open = newTab
    ? `<a href="${href}" target="_blank" rel="noopener">`
    : `<a href="${href}">`
  return wrapWithTagsPreservingSpaces(text, open, "</a>")
}

// =====================
//  TEXT NODE → HTML (UL/OL + options)
// =====================
function textNodeToHTML(node, opts) {
  const segments = node.getStyledTextSegments([
    "fontWeight",
    "fontName",
    "hyperlink",
    "fontSize",
    "listOptions",
    "indentation",
    "paragraphSpacing",
    "listSpacing",
    "paragraphIndent",
  ])

  const raw = node.characters

  // Build paragraph ranges [start,end) by splitting on '\n'
  const paras = []
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\n") { paras.push([start, i]); start = i + 1 }
  }
  paras.push([start, raw.length]) // last

  // Render inline for a sub-range using segment styles
  function renderInlineRange(rangeStart, rangeEnd) {
    let out = ""
    for (const seg of segments) {
      const s = Math.max(rangeStart, seg.start)
      const e = Math.min(rangeEnd, seg.end)
      if (e <= s) continue

      const txt = raw.slice(s, e)
      let chunk = escapeHTML(txt)

      const isBold = (Number(seg.fontWeight) || 400) >= 600 && opts.bold !== 'none'
      const styleName = seg.fontName && seg.fontName.style ? String(seg.fontName.style) : ""
      const isItalic = opts.em && /italic/i.test(styleName)
      const href = seg.hyperlink && seg.hyperlink.type === "URL" ? seg.hyperlink.value : null


      if (isItalic) {
        chunk = wrapEm(chunk)
      }
      if (isBold) {
        chunk = (opts && opts.bold === 'strong') ? wrapStrong(chunk) : wrapBoldSpan(chunk)
      }
      if (href) {
        const newTab = !opts || opts.links !== 'same' // newtab par défaut
        chunk = wrapLink(chunk, escapeHTML(href), newTab)
      }
      out += chunk
    }
    return out.replace(/\u2028/g, "<br>") // handle U+2028 line-separator
  }

  let html = ""
  let openList = null // "ul" | "ol" | null
  let paragraphBuffer = [] // for non-list lines when paras === 'p'

  const closeListIfAny = () => {
    if (openList === "ul") html += "</ul>"
    if (openList === "ol") html += "</ol>"
    openList = null
  }

  const flushParagraph = () => {
    let inBrBlock = false

    if (!paragraphBuffer.length) return
    if (opts.p) {
      // When p=true, join lines with <br> INSIDE the <p>
      html += `<p>${paragraphBuffer.join("<br>")}</p>`
    } else if (opts.br) {
      if (inBrBlock) html += "<br>"
      html += rendered
      inBrBlock = true
    } else {
      html += rendered
    }
    paragraphBuffer = []
  }

  for (const [ps, pe] of paras) {
    const paraText = raw.slice(ps, pe)
    const isBlank = paraText.trim() === ""

    let listType = null // "ul" | "ol" | null

    if (opts.lists === 'figma') {
      // Prefer Figma listOptions if present
      for (const seg of segments) {
        if (seg.end <= ps || seg.start >= pe) continue // no overlap
        const lo = seg.listOptions
        if (lo && lo.type) {
          listType = lo.type === "ORDERED" ? "ol" : lo.type === "UNORDERED" ? "ul" : null
          if (listType) break
        }
      }
      // Fallback to regex if no listOptions match
      if (!listType && !isBlank) {
        const { type } = classifyListLine(paraText)
        if (type) listType = type
      }
    } else {
      // 'regex' mode: ignore listOptions entirely
      if (!isBlank) {
        const { type } = classifyListLine(paraText)
        if (type) listType = type
      }
    }



    if (isBlank) {
      // blank line ends any paragraph and any list
      flushParagraph()
      closeListIfAny()

      // If we're in "br-only" mode, represent the blank paragraph with an extra <br>
      if (!opts.p && opts.br) html += "<br>"
      continue
    }


    // Compute range start (strip marker if regex matched)
    let rangeStart = ps
    if (listType) {
      const { strip } = classifyListLine(paraText)
      rangeStart = ps + (strip || 0)
    }

    const rendered = renderInlineRange(rangeStart, pe)


    // Determine listType per options
    if (listType) {
      flushParagraph()
      if (openList !== listType) {
        closeListIfAny()
        html += listType === "ul" ? "<ul>" : "<ol>"
        openList = listType
      }
      html += `<li>${rendered}</li>`
    } else {
      if (openList) closeListIfAny()

      if (opts.p) {
        // collect lines for the current paragraph, we’ll wrap at blank line or end
        paragraphBuffer.push(rendered)
      } else if (opts.br) {
        // stream directly with <br> (only when p=false)
        if (html && !html.endsWith("\n") && html !== "") html += "<br>"
        html += rendered
      } else {
        // neither p nor br: just append
        html += rendered
      }
    }
  }

  // flush tail
  if (openList) closeListIfAny()
  if (opts.p) flushParagraph()
  if (opts.br) flushParagraph()

  return html
}

// Return one HTML string per TEXT node (ordered)
function nodesToHTMLArray(textNodes, opts) {
  const ordered = sortReadingOrder(textNodes)
  return ordered.map(n => textNodeToHTML(n, opts))
}

// =====================
//  FONT GROUPING
// =====================

// Get a representative font for a node (by segment coverage)
function getPrimaryFontInfo(node) {
  const segs = node.getStyledTextSegments(["fontName", "fontWeight"])
  const freq = new Map() // family -> length
  let bestFamily = "Unknown"
  let bestLen = -1
  let bestStyle = ""
  let isVariable = false

  for (const s of segs) {
    const fam = s.fontName && s.fontName.family ? s.fontName.family : "Unknown"
    const len = Math.max(0, s.end - s.start)
    const total = (freq.get(fam) || 0) + len
    freq.set(fam, total)

    const style = s.fontName && s.fontName.style ? String(s.fontName.style) : ""
    const looksVariable = /variable/i.test(style) || /opsz|wdth|wght/i.test(style)

    if (total > bestLen) {
      bestLen = total
      bestFamily = fam
      bestStyle = style
      isVariable = !!looksVariable
    }
  }
  return { family: bestFamily, style: bestStyle, isVariable }
}

function nodesToCards(textNodes, opts) {
  const ordered = sortReadingOrder(textNodes)
  return ordered.map(n => {
    const html = textNodeToHTML(n, opts)
    const { family, style, isVariable } = getPrimaryFontInfo(n)
    return {
      nodeId: n.id,
      html,
      fontFamily: family,
      fontStyle: style,
      isVariable
    }
  })
}

function groupCardsByFont(cards) {
  const groupsMap = new Map() // key => { fontFamily, isVariable, items: [] }
  for (const card of cards) {
    const key = `${card.fontFamily}||${card.isVariable ? "var" : "static"}`
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        fontFamily: card.fontFamily,
        isVariable: card.isVariable,
        items: []
      })
    }
    groupsMap.get(key).items.push(card)
  }

  // Sort by family (A→Z), variable first within each family
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    const fa = a.fontFamily.toLowerCase()
    const fb = b.fontFamily.toLowerCase()
    if (fa !== fb) return fa.localeCompare(fb)
    return (a.isVariable === b.isVariable) ? 0 : (a.isVariable ? -1 : 1)
  })

  return groups
}

function getSelectedTextNodes() {
  const selected = figma.currentPage.selection
  const textInSelection = []
  for (const node of selected) {
    if (node.type === "TEXT") textInSelection.push(node)
    if (typeof node.findAll === "function") {
      for (const n of node.findAll(n => n.type === "TEXT")) textInSelection.push(n)
    }
  }
  const map = new Map()
  for (const n of textInSelection) map.set(n.id, n)
  return Array.from(map.values())
}

// Show UI
figma.showUI(__html__, { width: 360, height: 660 })

// ---- NEW: push selection info on load
function postSelectionSnapshot() {
  const textNodes = getSelectedTextNodes()
  figma.ui.postMessage({
    type: "selection",
    selectedTextCount: textNodes.length,
    totalSelectionCount: figma.currentPage.selection.length,
  })
}
postSelectionSnapshot()

// =====================
//        UI
// =====================

figma.on("selectionchange", () => {
  postSelectionSnapshot()
})

figma.ui.onmessage = (msg) => {
  if (!msg) return

  if (msg.type === "extract") {
    const opts = normalizeOptions(msg.options || {})

    const nodes = getSelectedTextNodes()
    if (!nodes.length) {
      figma.ui.postMessage({
        type: "result",
        items: [],
        groups: [],
        error: "Select frames/layers containing TEXT and try again."
      })
      return
    }

    // Back-compat flat array
    const items = nodesToHTMLArray(nodes, opts)

    // New: grouped by font family / variable
    const cards = nodesToCards(nodes, opts)
    const groups = groupCardsByFont(cards)

    figma.ui.postMessage({ type: "result", items, groups })
  }

  if (msg.type === "close") {
    figma.closePlugin()
  }
}
