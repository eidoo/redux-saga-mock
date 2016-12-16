import _ from 'lodash'
import { expect, assert } from 'chai'
import { combineReducers, createStore, applyMiddleware } from 'redux'
import createSagaMiddleware, { takeEvery } from 'redux-saga'
import * as effects from 'redux-saga/effects'

import { mockSaga } from '../src/mockSaga'

describe('mock saga', () => {
  const someInitialValue = 'SOME_INITIAL_VALUE'
  const someInitialState = { someKey: someInitialValue }
  const someActionType = 'SOME_ACTION_TYPE'
  const otherActionType = 'OTHER_ACTION_TYPE'
  const someAction = { type: someActionType, arg: 1 }
  const someAction2 = { type: someActionType, arg: 2 }
  const otherAction = { type: otherActionType }

  const someObj = {
    field: 'test',
    method (arg1, arg2) {
      return (arg1 || 0) + (arg2 || 0)
    }
  }

  let sagaMiddleware, store
  beforeEach(() => {
    sagaMiddleware = createSagaMiddleware()
    store = createStore(
      s => s,
      {},
      applyMiddleware(sagaMiddleware)
    )
  })

  context('initialization', () => {
    const chainableMethods = [
      'onEffect',
      'onTakeAction',
      'onPuttedAction',
      'onCall',
      'onCallWithArgs',
      'onCallWithExactArgs',
      'stubCall',
      'stubCallWithArgs',
      'stubCallWithExactArgs',
      'resetStubs',
      'clearStoredEffects',
    ]
    const filtersMethods = [
      'allEffects',
      'generatedEffect',
      'puttedAction',
      'takenAction',
      'called',
      'calledWithArgs',
      'calledWithExactArgs'
    ]
    const methods = chainableMethods.concat(filtersMethods)

    methods.forEach(methodName => {
      it(`Array should have method ${methodName}`, () => {
        const mock = mockSaga([
          takeEvery('*', function * () {
            yield 1
          }),
          takeEvery('*', function * () {
            yield 2
          })
        ])
        assert.property(mock, methodName)
        assert.isFunction(mock[methodName])
      })
    })
    methods.forEach(methodName => {
      it(`Generator function should have method ${methodName}`, () => {
        const mock = mockSaga(function * () {
          yield 1
        })
        assert.property(mock, methodName)
        assert.isFunction(mock[methodName])
      })
    })
    methods.forEach(methodName => {
      it(`Iterator should have method ${methodName}`, () => {
        const mock = mockSaga(function * () {
          yield 1
        }())
        assert.property(mock, methodName)
        assert.isFunction(mock[methodName])
      })
    })

  })

  function buildTests (gfn) {
    return {
      'generator function': gfn,
      'iterator': gfn(),
      'array': [
        (function * () { yield 'dummy' })(),
        gfn(),
        (function * () { yield 'dummy' })()
      ]
    }
  }
  const GeneratorFunction = (function*(){}).constructor;
  function runTest (test) {
    const gfn = test instanceof GeneratorFunction
      ? test
      : function * () { yield test }
    return sagaMiddleware.run(gfn)
  }

  describe('should find effect', () => {
    const effect = effects.select(s => s.a)
    const gfn = function * () {
      yield 'test'
      yield effect
    }
    _.forEach(buildTests(gfn), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.generatedEffect(effect).isPresent)
          assert.isFalse(mock.generatedEffect('not generated effect').isPresent)
        })
      })
    })
  })

  describe('should find put action', () => {
    const gfn = function * () {
      yield 'test'
      yield effects.put(someAction)
    }
    _.forEach(buildTests(gfn), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.puttedAction(someAction).isPresent)
          assert.isFalse(mock.puttedAction(otherAction).isPresent)
        })
      })
    })
  })

  describe('should find put action type', () => {
    let saga = function * () {
      yield 'test'
      yield effects.put(someAction)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.puttedAction(someActionType).isPresent)
          assert.isFalse(mock.puttedAction(otherActionType).isPresent)
        })
      })
    })
  })

  describe('should find take action', () => {
    const saga = function * () {
      yield 'test'
      yield effects.take(someActionType)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        const task = runTest(mock)
        store.dispatch(someAction)
        return task.done.then(() => {
          assert.isTrue(mock.takenAction(someActionType).isPresent)
          assert.isFalse(mock.takenAction(otherActionType).isPresent)
        })
      })
    })
  })

  describe('should find call', () => {
    const saga = function * () {
      yield 'test'
      yield effects.call(someObj.method)
      yield effects.call(someObj.method, 'a', 'b')
      yield effects.call(someObj.method, 'a', 'c')
      yield effects.call(someObj.method, 'b', 'c')
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const isArray = name === 'array'
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.called(someObj.method).isPresent)
          assert.isTrue(mock.calledWithArgs(someObj.method, 'a').isPresent)
          assert.isFalse(mock.calledWithArgs(someObj.method, 'c').isPresent)
          assert.isTrue(mock.calledWithExactArgs(someObj.method).isPresent)
          assert.isFalse(mock.calledWithExactArgs(someObj.method, 'a').isPresent)
          assert.isTrue(mock.calledWithExactArgs(someObj.method, 'a', 'b').isPresent)
          // let target
          if (name === 'array') {
            assert.equal(mock.called(someObj.method).count, 1)
            assert.equal(mock.calledWithArgs(someObj.method, 'a').count, 1)
            assert.equal(mock.calledWithArgs(someObj.method, 'a', 'b').count, 1)
            // target = mock.allEffects().effects[1]
            // TODO check count in sub elements of array
          } else {
            // target = mock
            assert.equal(mock.called(someObj.method).count, 4)
            assert.equal(mock.calledWithArgs(someObj.method, 'a').count, 2)
            assert.equal(mock.calledWithArgs(someObj.method, 'a', 'b').count, 1)
          }
        })
      })
    })
  })

  describe('should find in parrallel effects', () => {
    const saga = function * () {
      yield 'test'
      yield [
        effects.put(someAction),
        effects.put(otherAction)
      ]
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.puttedAction(someAction).isPresent)
          assert.isTrue(mock.puttedAction(otherAction).isPresent)
          assert.isFalse(mock.called(someObj.method).isPresent)
        })
      })
    })
  })

  describe('should find in race effects', () => {
    const saga = function * () {
      yield 'test'
      yield effects.race({
        a: effects.put(someAction),
        b: effects.put(otherAction)
      })
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.puttedAction(someAction).isPresent)
          assert.isTrue(mock.puttedAction(otherAction).isPresent)
          assert.isFalse(mock.called(someObj.method).isPresent)
        })
      })
    })
  })

  describe('should find in deep nested effects', () => {
    const saga = function * () {
      yield 'test'
      let selectEffect = effects.select(s => s.b)
      yield effects.race({
        a: [ effects.put(someAction), selectEffect ],
        b: [ selectEffect, effects.put(otherAction) ]
      })
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        return runTest(mock).done.then(() => {
          assert.isTrue(mock.puttedAction(someAction).isPresent)
          assert.isTrue(mock.puttedAction(otherAction).isPresent)
          assert.isFalse(mock.called(someObj.method).isPresent)
        })
      })
    })
  })

  describe('should listen effect', (done) => {
    const effect = effects.select(s => s.a)
    const saga = function * () {
      yield 'test'
      yield effect
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, () => {
        const mock = mockSaga(toTest)
        mock.onEffect(effect, done)
        runTest(mock)
      })
    })
  })

  describe('should listen put action', () => {
    const saga = function * () {
      yield 'test'
      yield effects.put(someAction)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
        mock.onPuttedAction(someAction2, () => done('invalid match on someAction2'))
        mock.onPuttedAction(someAction, () => done())
        runTest(mock)
      })
    })
  })

  describe('should listen put action type', () => {
    const saga = function * () {
      yield 'test'
      yield effects.put(someAction)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
        mock.onPuttedAction(someActionType, () => done())
        runTest(mock)
      })
    })
  })

  describe('should listen take action', () => {
    const saga = function * () {
      yield 'test'
      yield effects.take(someActionType)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
        mock.onTakeAction(someActionType, done)
        runTest(mock)
      })
    })
  })

  describe('should listen call', () => {
    const saga = function * () {
      yield 'test'
      yield effects.call(someObj.method)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
        mock.onCall(someObj.method, done)
        runTest(mock)
      })
    })
  })

  describe('should listen call with args', () => {
    const saga = function * () {
      yield 'test'
      yield effects.call(someObj.method, 2, 3)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
          .onCallWithArgs(someObj.method, [ 1 ], () => done('invalid call [1]'))
          .onCallWithArgs(someObj.method, [ 2, 3, 4 ], () => done('invalid call [2,3,4]'))
          .onCallWithArgs(someObj.method, [ 2, 3 ], done)
        runTest(mock)
      })
    })
  })

  describe('should listen call with exact args', () => {
    const saga = function * () {
      yield 'test'
      yield effects.call(someObj.method, 2, 3)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
          .onCallWithExactArgs(someObj.method, [], () => done('invalid call []'))
          .onCallWithExactArgs(someObj.method, [ 1 ], () => done('invalid call [1]'))
          .onCallWithExactArgs(someObj.method, [ 2 ], () => done('invalid call [2]'))
          .onCallWithExactArgs(someObj.method, [ 2, 3, 4 ], () => done('invalid call [2,3,4]'))
          .onCallWithExactArgs(someObj.method, [ 2, 3 ], done)
        runTest(mock)
      })
    })
  })

  describe('should stub call', () => {
    const toStub = () => done(new Error('toStub() should not be called'))
    const saga = function * () {
      yield 'test'
      yield effects.call(toStub)
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (done) => {
        const mock = mockSaga(toTest)
          .stubCall(toStub, () => done())
        runTest(mock)
      })
    })
  })

  describe('stub throw should be tranfered to the orginal saga', () => {
    const toStub = () => done(new Error('toStub() should not be called'))
    const error = new Error('test')
    let done
    const saga = function * () {
      try {
        yield 'test'
        yield effects.call(toStub)
      } catch (e) {
        assert.equal(e, error)
        done()
      }
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (_done) => {
        done = _done
        const mock = mockSaga(toTest)
          .stubCall(toStub, () => {
            throw error
          })
        runTest(mock)
      })
    })
  })

  describe('should stub call in parallel', () => {
    let toNotStubOk = false
    let toStubOk = false
    const toStub = () => done(new Error('toStub() should not be called'))
    const toNotStub = () => toNotStubOk = true
    let done
    const saga = function * () {
      yield 'test'
      yield [
        effects.call(toStub),
        effects.call(toNotStub)
      ]
      yield effects.call(() => {
        assert.isTrue(toStubOk)
        assert.isTrue(toNotStubOk)
        done()
      })
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (_done) => {
        done = _done
        const mock = mockSaga(toTest)
          .stubCall(toStub, () => toStubOk = true)
        runTest(mock)
      })
    })
  })

  describe('should stub call in race', () => {
    let toNotStubOk = false
    let toStubOk = false
    const toStub = () => done(new Error('toStub() should not be called'))
    const toNotStub = () => toNotStubOk = true
    let done
    const saga = function * () {
      yield 'test'
      yield effects.race({
        toStub: effects.call(toStub),
        toNotStub: effects.call(toNotStub)
      })
      yield effects.call(() => setTimeout(() => {
        assert.isTrue(toStubOk)
        assert.isTrue(toNotStubOk)
        done()
      }))
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (_done) => {
        done = _done
        const mock = mockSaga(toTest)
          .stubCall(toStub, () => {
            toStubOk = true
            return new Promise((resolve, reject) => {})
          })
        runTest(mock)
      })
    })
  })

  describe('should stub call in nested effects', () => {
    let toStubOk = false
    let toStub2Ok = false
    const toStub = () => done(new Error('toStub() should not be called'))
    const toStub2 = () => done(new Error('toStub2() should not be called'))
    let done
    const saga = function * () {
      yield 'test'
      yield [
        [ effects.put(someAction), effects.call(toStub) ],
        effects.race({ one: effects.take(someActionType), two: effects.call(toStub2) })
      ]
      yield effects.call(() => {
        assert.isTrue(toStubOk)
        assert.isTrue(toStub2Ok)
        done()
      })
    }
    _.forEach(buildTests(saga), (toTest, name) => {
      it(`on ${name}`, (_done) => {
        done = _done
        const mock = mockSaga(toTest)
          .stubCall(toStub, () => toStubOk = true)
          .stubCall(toStub2, () => toStub2Ok = true)
        runTest(mock)
      })
    })
  })

  it('test', () => {
    let flag = false;
    let obj = {
      pippo (arg) {
        return arg + 1
      }
    }

    function nodestyle (arg, cb) {
      cb(null, arg + 1)
    }

    function callThrow () {
      throw new Error('error call')
    }

    function toStub (arg1, arg2) {
      return `called toStub(${arg1}, ${arg2})`
    }

    const sagas = function* () {
      let r
      // r = yield effects.put(someAction)
      //  console.log('-- result', r)
      r = yield effects.put.sync(otherAction)
      console.log('-- result', r)
      r = yield effects.call(obj.pippo, 2)
      console.log('-- result', r)

      r = yield effects.call([ obj, obj.pippo ], 12)
      console.log('-- result', r)

      r = yield effects.cps(nodestyle, 30)
      console.log('-- result', r)

      try {
        r = yield effects.call(callThrow)
        console.log('** should not return result', r)
      } catch (e) {
        console.log('-- thrown', e.message)
      }

      r = yield effects.call(toStub, 1, 2)
      console.log('** result', r)

      r = yield effects.call(toStub, 1)
      console.log('** result', r)

      r = yield effects.call(toStub)
      console.log('** result', r)

      // r = yield effects.apply(obj, obj.pippo, 22)
      // console.log('-- result', r)

      r = yield 'stringa'
      console.log('-- result', r)

      r = yield Promise.resolve().then(() => 'promessa')
      console.log('-- result', r)

      r = yield effects.take(someActionType)
      console.log('-- result', r)

      r = yield effects.race({
        a: effects.call(obj.pippo, 100),
        c: effects.call(obj.pippo, 200),
        b: effects.take(otherActionType),
      })
      console.log('-- result', r)

      r = yield [
        effects.call(obj.pippo, 300),
        effects.call(toStub)
      ]
      console.log('-- result', r)

      flag = true;
    }
    const mock = mockSaga(sagas)
    mock
      .onTakeAction(someActionType, () => {
        console.log('dispacth someAction')
        store.dispatch(someAction)
      })
      .stubCallWithArgs(toStub, [ 1, 2 ], () => 'stubbed (1,2)')
      .stubCall(toStub, () => 'stubbed')
    return sagaMiddleware.run(mock).done.then(() => {
      expect(flag).to.equal(true)
      expect(mock.puttedAction(otherAction).isPresent).to.be.ok
      expect(mock.puttedAction(someAction).isPresent).to.not.be.ok
      expect(mock.generatedEffect('stringa').isPresent).to.be.true
      expect(mock.generatedEffect('stringa').followedBy.takenAction(someActionType).isPresent).to.be.true
    })
  })

})
