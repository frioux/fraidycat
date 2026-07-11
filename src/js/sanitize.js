//
// src/js/sanitize.js
//
// Recursively walk a DOM node, letting `fn` decide (and rewrite) each element,
// then serialize whatever survives back to an HTML string.
//
// This always runs on a *native* DOM node - the offscreen document and the UI
// page both have one, and the input comes from the native DOMParser - so it
// uses native APIs directly (el.ownerDocument, innerHTML) rather than a
// third-party DOM implementation.
//
module.exports = function(el, fn) {
  let san = sanitize(el, fn)
  if (!san)
    return ''
  //
  // The result is rendered via dangerouslySetInnerHTML, so serialize with the
  // HTML algorithm (innerHTML) rather than XML: void tags stay `<br>`, no
  // xmlns namespace is added, and it round-trips through the HTML parser
  // unchanged.
  //
  let holder = san.ownerDocument.createElement('div')
  holder.appendChild(san)
  return holder.innerHTML
}

function sanitize(el, fn) {
  if (el.hasChildNodes()) {
    for (var i = el.childNodes.length - 1; i > -1; i--) {
      sanitize(el.childNodes[i], fn)
    }
  }

  if (fn(el) !== false) {
    return el
  } else if (el.parentNode) {
    removeDomLayer(el)
    return
  } else {
    return domArray(el)
  }
}

function removeDomLayer(el) {
  let child = el.firstChild
  while (child) {
    let child2 = child.nextSibling
    el.parentNode.insertBefore(child, el)
    child = child2
  }
  el.parentNode.removeChild(el)
}

function domArray(el) {
  if (!el.hasChildNodes()) return
  if (el.childNodes.length == 1) return el.childNodes.item(0)

  let frag = el.ownerDocument.createDocumentFragment()
  let child = el.firstChild
  while (child) {
    let child2 = child.nextSibling
    frag.appendChild(child)
    child = child2
  }
  return frag
}
