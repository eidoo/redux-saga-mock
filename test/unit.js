import _ from 'lodash'
import { expect, assert } from 'chai'
import * as effects from 'redux-saga/effects'
import mockSaga from '../src/mockSaga'


describe('unit tests', () => {
  describe('effects testers', () => {
    const testEffects = {
      isTAKE: effects.take('test'),
      isPUT: effects.put({ type: 'test-put' }),
      isCALL: effects.call(() => {}),
      isRACE: effects.race({ a: effects.take('test'), b: effects.take('test2') }),
      other1: {a: effects.take('test')},
      other2: [effects.take('test')],
      other3: 'test'
    }
    const testFunctions = {
      isPUT: mockSaga.__get__('isPUT'),
      isTAKE: mockSaga.__get__('isTAKE'),
      isCALL: mockSaga.__get__('isCALL'),
      isRACE: mockSaga.__get__('isRACE')
    }

    _.forEach(testFunctions, (testFn, fnName) => {
      _.forEach(testEffects, (effect, effectName) => {
        it(`${fnName}() on effect ${effectName}`, () => {
          const actual = !!testFn(effect)
          const expected = fnName === effectName
          assert.equal(actual, expected)
        })
      })
    })
  })

  const matchers = mockSaga.__get__('matchers')

  const DUMMY_FN = () => {}

  const matcherTestCases = {
    putAction: [
      { arg: 'TEST', effectToCheck: effects.put({ type: 'TEST' }), expected: true },
      { arg: 'TEST', effectToCheck: effects.put({ type: 'TEST', data: 'x' }), expected: true },
      { arg: 'TEST', effectToCheck: effects.put({ type: 'test' }), expected: false },
      { arg: 'TEST', effectToCheck: effects.take('TEST'), expected: false },
      { arg: 'TEST', effectToCheck: { type: 'TEST' }, expected: false },
      { arg: 'TEST', effectToCheck: 'TEST', expected: false },
      { arg: { type: 'TEST' }, effectToCheck: effects.put({ type: 'TEST' }), expected: true },
      { arg: { type: 'TEST' }, effectToCheck: effects.put({ type: 'TEST', data: 'x' }), expected: false },
      { arg: { type: 'TEST' }, effectToCheck: effects.put({ type: 'test' }), expected: false },
      { arg: { type: 'TEST' }, effectToCheck: effects.take('TEST'), expected: false },
      { arg: { type: 'TEST' }, effectToCheck: { type: 'TEST' }, expected: false },
      { arg: { type: 'TEST' }, effectToCheck: 'TEST', expected: false },
    ],
    takeAction: [
      { arg: 'TEST', effectToCheck: effects.take('TEST'), expected: true },
      { arg: 'TEST', effectToCheck: effects.take('test'), expected: false },
      { arg: 'TEST', effectToCheck: effects.put({ type: 'TEST' }), expected: false },
      { arg: 'TEST', effectToCheck: { type: 'TEST' }, expected: false },
    ],
    effect: [
      { arg: effects.take('TEST'), effectToCheck: effects.take('TEST'), expected: true },
      { arg: effects.put({type: 'TEST'}), effectToCheck: effects.put({type: 'TEST'}), expected: true },
      { arg: effects.call(DUMMY_FN, 1), effectToCheck: effects.call(DUMMY_FN, 1), expected: true },
      { arg: effects.take('TEST'), effectToCheck: effects.take('test'), expected: false },
      { arg: effects.put({type: 'TEST'}), effectToCheck: effects.put({type: 'test'}), expected: false },
      { arg: effects.call(DUMMY_FN, 1), effectToCheck: effects.call(DUMMY_FN), expected: false },
      { arg: effects.call(DUMMY_FN, 1), effectToCheck: effects.call(DUMMY_FN, 1, 2), expected: false },
    ],
    call: [
      { arg: DUMMY_FN, effectToCheck: effects.call(DUMMY_FN, 1), expected: true },
      { arg: DUMMY_FN, effectToCheck: effects.call(DUMMY_FN), expected: true },
      { arg: DUMMY_FN, effectToCheck: effects.call(DUMMY_FN, 1, 2), expected: true },
      { arg: DUMMY_FN, effectToCheck: effects.call(() => {}, 1), expected: false },
      { arg: DUMMY_FN, effectToCheck: effects.take('test'), expected: false },
    ],
    callWithArgs: [
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN, 1), expected: true },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN), expected: false },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN, 1, 2), expected: true },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(() => {}, 1), expected: false },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.take('test'), expected: false },
    ],
    callWithExactArgs: [
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN, 1), expected: true },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN), expected: false },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(DUMMY_FN, 1, 2), expected: false },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.call(() => {}, 1), expected: false },
      { args: [DUMMY_FN, [1]], effectToCheck: effects.take('test'), expected: false },
    ]
  }

  describe('matchers', () => {
    _.forEach(matcherTestCases, (tests, matcherBuilderName) => describe(`matchers.${matcherBuilderName}()`, () => {
      it('should return a function', () => {
        assert.isFunction(matchers[matcherBuilderName]())
      })
      tests.forEach((test, idx) => {
        const args = test.args || [test.arg]
        const match = matchers[matcherBuilderName](...args)
        it(`test ${idx + 1}`, () => {
          const actual = !!match(test.effectToCheck)
          assert.equal(actual, test.expected)
        })
        it(`test ${idx + 1} with effect inside array`, () => {
          const actual = !!match([ test.effectToCheck ])
          assert.equal(actual, false)
        })
        it(`test ${idx + 1} with effect inside race`, () => {
          const actual = !!match(effects.race({ first: test.effectToCheck, second: 'dummy'}))
          assert.equal(actual, false)
        })
      })
    }))
  })

  describe('recursive(matcher)', () => {
    const recursive = mockSaga.__get__('recursive')

    it('should return a function', () => {
      const returned = recursive(DUMMY_FN)
      assert.isFunction(returned)
    })

    _.forEach(matcherTestCases, (tests, matcherBuilderName) => describe(`on matchers.${matcherBuilderName}()`, () => {
      tests.forEach((test, idx) => {
        const args = test.args || [test.arg]
        const match = recursive(matchers[matcherBuilderName](...args))
        it(`test ${idx + 1} with effect inside array`, () => {
          const actual = !!match([ {}, test.effectToCheck, {} ])
          assert.equal(actual, test.expected)
        })
        it(`test ${idx + 1} with effect inside race`, () => {
          const actual = !!match(effects.race({ first: {}, second: test.effectToCheck, third: 'dummy'}))
          assert.equal(actual, test.expected)
        })
        it(`test ${idx + 1} with effect inside race inside array`, () => {
          const nestedEffect = [{}, effects.race({ first: {}, second: test.effectToCheck, third: 'dummy'}), {}]
          const actual = !!match(nestedEffect)
          assert.equal(actual, test.expected)
        })
      })
    }))
  })

  describe('rreplace()', () => {
    const rreplace = mockSaga.__get__('rreplace')
    const MATCH = { test: 'matching-effect' }
    const OTHER = { test: 'not-matching-effect' }
    const REPLACED = { test: 'replaced-effect' }
    const testCases = [
      { effect: MATCH, expected: REPLACED },
      { effect: OTHER, expected: OTHER },
      { effect: [MATCH], expected: [REPLACED] },
      { effect: [OTHER, MATCH, OTHER], expected: [OTHER, REPLACED, OTHER] },
      { effect: [MATCH, OTHER, MATCH, OTHER, MATCH], expected: [REPLACED, OTHER, REPLACED, OTHER, REPLACED] },
      { effect: [OTHER, OTHER], expected: [OTHER, OTHER] },
      {
        effect:   effects.race({a: OTHER, b: MATCH,    c: OTHER}),
        expected: effects.race({a: OTHER, b: REPLACED, c: OTHER})
      }, {
        effect:   effects.race({a: MATCH,    b: OTHER, c: MATCH,    d: OTHER}),
        expected: effects.race({a: REPLACED, b: OTHER, c: REPLACED, d: OTHER})
      }, {
        effect:   effects.race({a: OTHER, b: OTHER, c: OTHER}),
        expected: effects.race({a: OTHER, b: OTHER, c:  OTHER})
      }, {
        effect:   [OTHER, effects.race({a: OTHER, b: MATCH,    c: OTHER}), OTHER],
        expected: [OTHER, effects.race({a: OTHER, b: REPLACED, c: OTHER}), OTHER]
      },
    ]
    testCases.forEach(({effect, expected}, idx) => {
      it(`test ${idx + 1}`, () => {
        const actual = rreplace(matchers.effect(MATCH), effect, () => REPLACED)
        assert.deepEqual(actual, expected)
      })
    })
  })

  describe('findAllIndexes()', () => {
    const findAllIndexes = mockSaga.__get__('findAllIndexes')
    const testCases = [
      { array: [], expected: [] },
      { array: [1], expected: [0] },
      { array: [1,1], expected: [0,1] },
      { array: [1,1,1], expected: [0,1,2] },
      { array: [0,0,0], expected: [] },
      { array: [1,0,1], expected: [0,2] },
      { array: [0,1,0], expected: [1] },
      { array: [0,1,1,0], expected: [1,2] },
      { array: [1,1,1,0], from: 1, expected: [1,2] },
      { array: [0,1,1,1], last: 2, expected: [1,2] },
      { array: [1,1,1,1], from: 1, last: 2, expected: [1,2] },
      { array: [1,0,0,1], from: 1, last: 2, expected: [] },
    ]
    testCases.forEach(({array, expected, from, last}, idx) => {
      it(`test ${idx + 1}`, () => {
        const actual = findAllIndexes(array, v => !!v, from, last )
        assert.deepEqual(actual, expected)
      })
    })
  })
})