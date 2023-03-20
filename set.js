function init(ssb, config) {
  let oldestSeq = 1
  let latestSeq = 0
  const seqAdded = new Map()

  const loadPromise = new Promise((resolve, reject) => {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'set'
    )
    for (const msg of iterator) {
      if (!msg) continue
      if (!msg.value.content) continue
      if (msg.value.content.oldest) {
        oldestSeq = Math.max(oldestSeq, msg.value.content.oldest)
      }
      latestSeq = Math.max(latestSeq, msg.value.sequence)
      if (msg.value.content.add) {
        seqAdded.set(msg.value.content.add, msg.value.sequence)
      }
    }
    resolve()
  })

  function loaded(cb) {
    if (cb === void 0) return loadPromise
    else loadPromise.then(() => cb(null), cb)
  }

  function has(name, cb) {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'set'
    )
    let found = false
    for (const msg of iterator) {
      if (msg.value.content.add === name) {
        found = true
      } else if (msg.value.content.remove === name) {
        found = false
      }
    }
    return cb(null, found)
  }

  function add(name, cb) {
    has(name, (err, exists) => {
      if (err) return cb(err)
      if (exists) return cb(null, false)
      const newOldestSeq = seqAdded.size === 0 ? latestSeq + 1 : oldestSeq

      ssb.db.create(
        {
          feedFormat: 'classic',
          content: {
            type: 'TODO',
            structure: 'set',
            oldest: newOldestSeq,
            add: name,
          },
        },
        (err, msg) => {
          if (err) return cb(err)
          seqAdded.set(name, msg.value.sequence)
          latestSeq = msg.value.sequence
          oldestSeq = newOldestSeq
          cb(null, true)
        }
      )
    })
  }

  function del(name, cb) {
    has(name, (err, exists) => {
      if (err) return cb(err)
      if (!exists) return cb(null, false)
      const seq = seqAdded.get(name)
      const willBecomeEmpty = seqAdded.size === 1 && seqAdded.has(name)
      seqAdded.delete(name)
      const minSeqOfRemaining = Math.min(...seqAdded.values())
      const newOldestSeq = willBecomeEmpty
        ? latestSeq + 1
        : seq < minSeqOfRemaining
        ? minSeqOfRemaining
        : oldestSeq

      ssb.db.create(
        {
          feedFormat: 'classic',
          content: {
            type: 'TODO',
            structure: 'set',
            oldest: newOldestSeq,
            remove: name,
          },
        },
        (err, msg) => {
          if (err) {
            seqAdded.set(name, seq) // undo
            return cb(err)
          }
          latestSeq = msg.value.sequence
          oldestSeq = newOldestSeq
          cb(null, true)
        }
      )
    })
  }

  function values() {
    const iterator = ssb.db.filterAsIterator(
      (msg) => msg?.value?.content?.structure === 'set'
    )
    const set = new Set()
    for (const msg of iterator) {
      const { content } = msg.value
      if (content.add) set.add(content.add)
      else if (content.remove) set.delete(content.remove)
    }
    return set.values()
  }

  return {
    // Public API
    loaded,
    add,
    has,
    del,
    values,

    // Internal API, exposed for testing
    _getOldest: () => oldestSeq,
  }
}

module.exports = {
  name: 'predsl',
  init,
}
