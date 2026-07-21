/**
 * ────────────────────────────────────────────────────────────────────
 * TEMPLATE — copy into <site-root>/js/lead-form.js and search-replace
 * "FireProof" / "fireproofapp" with your brand's names. All product/
 * form-type names below are the FireProof canonical set; adapt to your
 * Attio configuration (list slug, form_types, plan_interests).
 * ────────────────────────────────────────────────────────────────────
 *
 * FireProof marketing site — lead-form widget (progressive enhancement)
 *
 * Intercepts clicks on elements with data-lead-form="<form_type>". Opens a
 * lightweight modal, captures UTM/referrer/landing-page automatically, POSTs
 * to /api/lead. If JS is disabled or the widget errors, the original
 * href="mailto:..." on the anchor is preserved as a fallback.
 *
 * IDENTICAL between site/ and site-uk/. The server-side handler decides market.
 * Run scripts/marketing-shared/verify-site-parity.mjs to catch drift.
 *
 * Usage:
 *   <a href="mailto:sales@fireproofapp.com?subject=Demo"
 *      data-lead-form="demo_request"
 *      data-plan-interest="professional">Get a Demo</a>
 *
 * Optional data-* attributes on the trigger:
 *   data-lead-form="<form_type>"        (required — one of the 9 valid values)
 *   data-plan-interest="growth|professional|enterprise|reseller|unspecified"
 *   data-form-title="Custom modal title"
 *   data-form-fields="basic|reseller"   (basic = default; reseller adds extra fields)
 */
(function () {
  'use strict'

  var VALID_FORM_TYPES = [
    'demo_request', 'reseller_inquiry',
    'pricing_growth', 'pricing_professional', 'pricing_enterprise',
    'ios_early_access', 'contact_sales', 'support', 'security',
  ]

  var TITLES = {
    demo_request: 'Book a FireProof demo',
    reseller_inquiry: 'Reseller program inquiry',
    pricing_growth: 'FireProof Growth — get in touch',
    pricing_professional: 'FireProof Professional — get in touch',
    pricing_enterprise: 'FireProof Enterprise — get in touch',
    ios_early_access: 'iOS app early access',
    contact_sales: 'Contact FireProof sales',
    support: 'Contact FireProof support',
    security: 'Report a security issue',
  }

  // ─── UTM / attribution capture ───────────────────────────────────────
  function readAttribution() {
    var q = new URLSearchParams(window.location.search)
    return {
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
      utm_content: q.get('utm_content') || '',
      referrer_url: document.referrer || '',
      landing_page: window.location.href,
    }
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────
  function el(tag, props, children) {
    var e = document.createElement(tag)
    if (props) for (var k in props) {
      if (k === 'style') Object.assign(e.style, props[k])
      else if (k in e) e[k] = props[k]
      else e.setAttribute(k, props[k])
    }
    if (children) for (var i = 0; i < children.length; i++) {
      var c = children[i]
      if (c == null) continue
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    }
    return e
  }

  // ─── Modal ───────────────────────────────────────────────────────────
  var overlay = null

  function closeModal() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    overlay = null
    document.body.style.overflow = ''
  }

  function openModal(formType, planInterest, customTitle, fieldSet) {
    closeModal()
    var title = customTitle || TITLES[formType] || 'Get in touch'
    var isReseller = fieldSet === 'reseller' || formType === 'reseller_inquiry'

    // Overlay
    overlay = el('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      style: {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '10000', padding: '1rem',
      },
    })
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal() })

    // Card
    var card = el('div', {
      style: {
        background: '#0f172a', color: '#f1f5f9', borderRadius: '12px',
        maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto',
        padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
      },
    })

    var closeBtn = el('button', {
      type: 'button', 'aria-label': 'Close', innerHTML: '&times;',
      style: {
        position: 'absolute', top: '1rem', right: '1rem',
        background: 'transparent', border: 'none', color: '#94a3b8',
        fontSize: '1.75rem', cursor: 'pointer', lineHeight: '1',
      },
    })
    closeBtn.addEventListener('click', closeModal)

    var form = el('form', { noValidate: true, style: { display: 'grid', gap: '0.85rem' } })
    form.appendChild(el('h2', { style: { margin: '0 0 0.5rem', fontSize: '1.35rem' } }, [title]))

    // Honeypot — hidden from users, bots fill it
    var hp = el('input', {
      type: 'text', name: 'website', autocomplete: 'off', tabIndex: '-1',
      'aria-hidden': 'true',
      style: { position: 'absolute', left: '-9999px', opacity: '0', height: '0', width: '0' },
    })
    form.appendChild(hp)

    function fld(label, name, type, required) {
      var wrap = el('label', { style: { display: 'grid', gap: '0.25rem', fontSize: '0.875rem' } })
      wrap.appendChild(el('span', {}, [label + (required ? ' *' : '')]))
      var input = el('input', {
        type: type, name: name, required: !!required, autocomplete: name,
        style: {
          padding: '0.6rem 0.75rem', borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
          fontSize: '0.95rem',
        },
      })
      wrap.appendChild(input)
      return wrap
    }

    // Name row
    var row = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } })
    row.appendChild(fld('First name', 'first_name', 'text', false))
    row.appendChild(fld('Last name', 'last_name', 'text', false))
    form.appendChild(row)

    form.appendChild(fld('Work email', 'email', 'email', true))
    form.appendChild(fld('Company / organization', 'company', 'text', false))
    form.appendChild(fld('Phone', 'phone', 'tel', false))

    if (isReseller) {
      form.appendChild(fld('Estimated extinguishers under management', 'estimated_extinguishers', 'number', false))
      var orgWrap = el('label', { style: { display: 'grid', gap: '0.25rem', fontSize: '0.875rem' } })
      orgWrap.appendChild(el('span', {}, ['Organization type']))
      var orgSel = el('select', {
        name: 'organization_type',
        style: {
          padding: '0.6rem 0.75rem', borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
        },
      })
      ;[
        ['', '— select —'],
        ['single_facility', 'Single facility'],
        ['multi_facility', 'Multi-facility'],
        ['reseller', 'Reseller / partner'],
        ['service_provider', 'Fire-protection service provider'],
        ['other', 'Other'],
      ].forEach(function (o) { orgSel.appendChild(el('option', { value: o[0] }, [o[1]])) })
      orgWrap.appendChild(orgSel)
      form.appendChild(orgWrap)
    }

    var msgWrap = el('label', { style: { display: 'grid', gap: '0.25rem', fontSize: '0.875rem' } })
    msgWrap.appendChild(el('span', {}, ['Anything else? (optional)']))
    msgWrap.appendChild(el('textarea', {
      name: 'message', rows: '3', maxLength: '5000',
      style: {
        padding: '0.6rem 0.75rem', borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
        resize: 'vertical', minHeight: '4rem', fontFamily: 'inherit',
      },
    }))
    form.appendChild(msgWrap)

    // Consent — default unchecked (skill rule)
    var consent = el('label', { style: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#cbd5e1' } })
    consent.appendChild(el('input', { type: 'checkbox', name: 'newsletter_opt_in' }))
    consent.appendChild(el('span', {}, ['Send me FireProof product updates. You can unsubscribe any time.']))
    form.appendChild(consent)

    var terms = el('label', { style: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#cbd5e1' } })
    terms.appendChild(el('input', { type: 'checkbox', name: 'terms_accepted', required: true }))
    terms.appendChild(el('span', {}, ['I agree to be contacted about FireProof. *']))
    form.appendChild(terms)

    var submitBtn = el('button', {
      type: 'submit', textContent: 'Send',
      style: {
        padding: '0.75rem 1.25rem', borderRadius: '6px',
        background: 'linear-gradient(135deg, #f97316, #ea580c)',
        color: '#fff', border: 'none', fontWeight: '600',
        fontSize: '0.95rem', cursor: 'pointer', marginTop: '0.5rem',
      },
    })
    form.appendChild(submitBtn)

    var statusLine = el('div', {
      role: 'status', 'aria-live': 'polite',
      style: { fontSize: '0.8125rem', color: '#94a3b8', minHeight: '1.2rem' },
    })
    form.appendChild(statusLine)

    form.addEventListener('submit', async function (e) {
      e.preventDefault()
      submitBtn.disabled = true
      statusLine.textContent = 'Sending…'
      statusLine.style.color = '#94a3b8'

      var fd = new FormData(form)
      var payload = {
        form_type: formType,
        plan_interest: planInterest || undefined,
        // Attribution — captured from the page URL, not the form fields
      }
      Object.assign(payload, readAttribution())
      fd.forEach(function (v, k) {
        if (k === 'newsletter_opt_in' || k === 'terms_accepted') payload[k] = true
        else if (k === 'estimated_extinguishers') { var n = Number(v); if (!isNaN(n)) payload[k] = n }
        else payload[k] = v
      })
      // Checkboxes only appear in FormData if checked — default the unchecked ones
      if (!('newsletter_opt_in' in payload)) payload.newsletter_opt_in = false
      if (!('terms_accepted' in payload)) payload.terms_accepted = false

      try {
        var res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('http ' + res.status)
        statusLine.style.color = '#4ade80'
        statusLine.textContent = 'Thanks — we\'ll be in touch shortly.'
        setTimeout(closeModal, 1600)
      } catch (err) {
        // Fallback path: never lose the lead — offer the mailto link
        statusLine.style.color = '#f87171'
        statusLine.textContent = 'Sorry, something went wrong. Please email sales@fireproofapp.com directly.'
        submitBtn.disabled = false
      }
    })

    card.appendChild(closeBtn)
    card.appendChild(form)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'

    var firstInput = form.querySelector('input[name=first_name]') || form.querySelector('input[name=email]')
    if (firstInput) firstInput.focus()

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc) }
    })
  }

  // ─── Trigger wiring ──────────────────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var t = ev.target
    while (t && t !== document.body) {
      if (t.hasAttribute && t.hasAttribute('data-lead-form')) {
        var formType = t.getAttribute('data-lead-form')
        if (VALID_FORM_TYPES.indexOf(formType) === -1) return
        ev.preventDefault()
        openModal(
          formType,
          t.getAttribute('data-plan-interest') || '',
          t.getAttribute('data-form-title') || '',
          t.getAttribute('data-form-fields') || ''
        )
        return
      }
      t = t.parentNode
    }
  })
})()
