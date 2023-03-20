function init(ssb, config) {
  let oldestSeq = 1
  let latestSeq = 0
  let seqWhenUpdated = new Map()

  const loadPromise = new Promise((resolve, reject) => {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'record'
    )
    for (const msg of iterator) {
      if (!msg) continue
      if (!msg.value.content) continue
      if (msg.value.content.oldest) {
        oldestSeq = Math.max(oldestSeq, msg.value.content.oldest)
      }
      latestSeq = Math.max(latestSeq, msg.value.sequence)
      if (msg.value.content.update) {
        for (const key in msg.value.content.update) {
          seqWhenUpdated.set(key, msg.value.sequence)
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

  function update(changes, cb) {
    get((err, record) => {
      if (err) return cb(err)
      let hasChanges = false
      for (const [key, value] of Object.entries(changes)) {
        if (value !== record[key]) {
          hasChanges = true
          break
        }
      }
      if (!hasChanges) return cb(null, false)

      const prevEntries = [...seqWhenUpdated.entries()]
      for (const key in changes) {
        seqWhenUpdated.set(key, latestSeq + 1)
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
    })
  }

  return {
    // Public API
    loaded,
    update,
    get,

    // Internal API, exposed for testing
    _getOldest: () => oldestSeq,
  }
}

module.exports = {
  name: 'predsl',
  init,
}
