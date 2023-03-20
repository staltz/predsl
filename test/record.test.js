const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const os = require('os')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const p = require('util').promisify

const DIR = path.join(os.tmpdir(), 'ssb-predsl-record')
rimraf.sync(DIR)

let ssb
test('setup', async (t) => {
  ssb = SecretStack({ appKey: caps.shs })
    .use(require('ssb-memdb'))
    .use(require('ssb-classic'))
    .use(require('ssb-box'))
    .use(require('../record'))
    .call(null, {
      keys: ssbKeys.generate('ed25519', 'alice'),
      path: DIR,
    })

  await ssb.db.loaded()
  await ssb.predsl.loaded()
})

test('predsl Record update', async (t) => {
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.ok(await p(ssb.predsl.update)({name: 'alice'}), 'update .name') // msg seq 1
  t.deepEqual(await p(ssb.predsl.get)(), {name: 'alice'}, 'get')
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.ok(await p(ssb.predsl.update)({age: 20}), 'update .age') // msg seq 2
  t.deepEqual(await p(ssb.predsl.get)(), {name: 'alice', age: 20}, 'get')
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.false(await p(ssb.predsl.update)({name: 'alice'}), 'redundant update .name')
  t.deepEqual(await p(ssb.predsl.get)(), {name: 'alice', age: 20}, 'get')
  t.equals(ssb.predsl._getOldest(), 1, 'oldest=1')

  t.ok(await p(ssb.predsl.update)({name: 'Alice'}), 'update .name') // msg seq 3
  t.deepEqual(await p(ssb.predsl.get)(), {name: 'Alice', age: 20}, 'get')
  t.equals(ssb.predsl._getOldest(), 2, 'oldest=2')
})

test('predsl Record squeeze', async t => {
  t.ok(await p(ssb.predsl.update)({age: 21}), 'update .age') // msg seq 4
  t.ok(await p(ssb.predsl.update)({age: 22}), 'update .age') // msg seq 5
  t.ok(await p(ssb.predsl.update)({age: 23}), 'update .age') // msg seq 6

  t.equals(ssb.predsl._getOldest(), 3, 'oldest=3')

  t.equals(ssb.predsl._squeezePotential(), 2, 'squeezePotential=2')
  t.ok(await p(ssb.predsl.squeeze)(), 'squeezed')
})

test('teardown', (t) => {
  ssb.close(t.end)
})
