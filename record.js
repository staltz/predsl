const p = require('util').promisify

function init(ssb, config) {
  let oldestSeq = 1
  let latestSeq = 0
  let seqWhenUpdated = new Map() // field name => sequence

  const loadPromise = new Promise((resolve, reject) => {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'record'
    )
    for (const msg of iterator) {
      if (!msg) continue
      if (!msg.value.content) continue
      if (typeof msg.value.content !== 'object') continue
      const { sequence, content } = msg.value
      if (content.oldest) {
        oldestSeq = Math.max(oldestSeq, content.oldest)
      }
      latestSeq = Math.max(latestSeq, sequence)
      if (content.update) {
        for (const field in content.update) {
          seqWhenUpdated.set(field, sequence)
        }
      }
    }
    resolve()
  })

  function loaded(cb) {
    if (cb === void 0) return loadPromise
    else loadPromise.then(() => cb(null), cb)
  }

  function get(cb) {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'record'
    )
    const record = {}
    for (const msg of iterator) {
      const { update } = msg.value.content
      Object.assign(record, update)
    }
    cb(null, record)
  }

  function forceUpdate(changes, cb) {
    const prevEntries = [...seqWhenUpdated.entries()]
    for (const field in changes) {
      seqWhenUpdated.set(field, latestSeq + 1)
    }
    const newOldestSeq = Math.min(...seqWhenUpdated.values())

    ssb.db.create(
      {
        feedFormat: 'classic',
        content: {
          type: 'TODO',
          structure: 'record',
          oldest: newOldestSeq,
          update: changes,
        },
      },
      (err, msg) => {
        if (err) {
          seqWhenUpdated = new Map(prevEntries) // undo
          return cb(err)
        }
        latestSeq = msg.value.sequence
        oldestSeq = newOldestSeq
        cb(null, true)
      }
    )
  }

  function update(changes, cb) {
    get((err, record) => {
      if (err) return cb(err)
      let hasChanges = false
      for (const [field, value] of Object.entries(changes)) {
        if (value !== record[field]) {
          hasChanges = true
          break
        }
      }
      if (!hasChanges) return cb(null, false)

      forceUpdate(changes, cb)
    })
  }

  function _squeezePotential() {
    const numSlots = latestSeq - oldestSeq + 1
    const occupiedSlots = seqWhenUpdated.size
    return numSlots - occupiedSlots
  }

  async function squeeze(cb) {
    const seqs = [...seqWhenUpdated.values(), latestSeq].sort((a, b) => a - b)
    const gaps = seqs.map((seq, i) => seq - (i === 0 ? oldestSeq : seqs[i - 1]))
    const largestGap = Math.max(...gaps)
    if (largestGap <= 1) return cb(null, false)

    const record = await p(get)()
    const fields = []
    for (let i = 1; i < seqs.length; i++) {
      const prevSeq = seqs[i - 1]
      const gapWithPrev = gaps[i]
      if (gapWithPrev >= 2) {
        const name = [...seqWhenUpdated.entries()].find(
          ([, v]) => v === prevSeq
        )[0]
        fields.push(name)
      }
    }
    if (fields.length === 0) return cb(null, false)
    const changes = fields.reduce((acc, field) => {
      acc[field] = record[field]
      return acc
    }, {})
    await p(forceUpdate)(changes)
    cb(null, true)
  }

  return {
    // Public API
    loaded,
    get,
    update,
    squeeze,

    // Internal API, exposed for testing
    _getOldest: () => oldestSeq,
    _squeezePotential,
  }
}

module.exports = {
  name: 'predsl',
  init,
}
