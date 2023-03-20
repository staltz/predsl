const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ssb-predsl-set')
rimraf.sync(DIR)

let ssb
test('setup', async (t) => {
  ssb = SecretStack({ appKey: caps.shs })
    .use(require('ssb-memdb'))
    .use(require('ssb-classic'))
    .use(require('ssb-box'))
    .use(require('../set'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()
  await ssb.predsl.loaded()
})

test('predsl Set add', async (t) => {
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.ok(await p(ssb.predsl.add)('1st'), 'add 1st') // msg seq 1
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.ok(await p(ssb.predsl.add)('2nd'), 'add 2nd') // msg seq 2
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.true(await p(ssb.predsl.has)('1st'), 'has 1st')
  t.ok(await p(ssb.predsl.del)('1st'), 'del 1st') // msg seq 3
  t.equals(ssb.predsl._getOldest(), 2, 'oldest=2')

  t.false(await p(ssb.predsl.has)('1st'), 'has not 1st')
  t.ok(await p(ssb.predsl.del)('2nd'), 'del 2nd') // msg seq 4
  t.equals(ssb.predsl._getOldest(), 4, 'oldest=4')

  t.notOk(await p(ssb.predsl.del)('2nd'), 'del 2nd redundant')
  t.false(await p(ssb.predsl.has)('2nd'), 'has not 2nd')
  t.equals(ssb.predsl._getOldest(), 4, 'oldest=4')

})

test('predsl Set values iterator', async (t) => {
  t.ok(await p(ssb.predsl.add)('alice'), 'add') // msg seq 5
  t.equals(ssb.predsl._getOldest(), 5, 'oldest=5')

  t.ok(await p(ssb.predsl.add)('bob'), 'add') // msg seq 6
  t.equals(ssb.predsl._getOldest(), 5, 'oldest=5')

  t.ok(await p(ssb.predsl.add)('carol'), 'add') // msg seq 7
  t.equals(ssb.predsl._getOldest(), 5, 'oldest=5')

  const expected = ['alice', 'bob', 'carol']
  for (const member of ssb.predsl.values()) {
    t.equal(member, expected.shift(), 'member')
  }
  t.equals(expected.length, 0, 'all members')
})

test('predsl Set delete mid does not change oldest', async (t) => {
  t.ok(await p(ssb.predsl.del)('bob'), 'del bob') // msg seq 8
  t.equals(ssb.predsl._getOldest(), 5, 'oldest=5')
})

test('predsl Set delete oldest does change oldest', async (t) => {
  t.ok(await p(ssb.predsl.del)('alice'), 'del alice') // msg seq 9
  t.equals(ssb.predsl._getOldest(), 7, 'oldest=7')
})

test('predsl Set squeeze', async (t) => {
  t.ok(await p(ssb.predsl.add)('dave'), 'add') // msg seq 10
  t.ok(await p(ssb.predsl.del)('dave'), 'del') // msg seq 11
  t.equals(ssb.predsl._getOldest(), 7, 'oldest=7')

  t.equals(ssb.predsl._squeezePotential(), 4, 'squeezePotential=4')
  t.ok(await p(ssb.predsl.squeeze)(), 'squeezed, re-adding carol') // msg seq 12
  t.equals(ssb.predsl._getOldest(), 12, 'oldest=12')
})

test('teardown', (t) => {
  ssb.close(t.end)
})
