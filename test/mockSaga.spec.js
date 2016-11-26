import _ from 'lodash'
import { expect, assert } from 'chai'
import { combineReducers, createStore, applyMiddleware } from 'redux'
import createSagaMiddleware from 'redux-saga'
import * as effects from 'redux-saga/effects'

import { mockSaga } from '../src/mockSaga'

describe('mock saga', () => {
  const someInitialValue = 'SOME_INITIAL_VALUE'
  const someInitialState = { someKey: someInitialValue }
  const someActionType = 'SOME_ACTION_TYPE'
  const otherActionType = 'OTHER_ACTION_TYPE'
  const someAction = { type: someActionType }
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

  it('should find effect', () => {
    const effect = effects.select(s => s.a)
    const mock = mockSaga(function * () {
      yield 'test'
      yield effect
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.generatedEffect(effect).isPresent)
      assert.isFalse(mock.generatedEffect('not generated effect').isPresent)
    })
  })

  it('should find put action', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.put(someAction)
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.puttedAction(someAction).isPresent)
      assert.isFalse(mock.puttedAction(otherAction).isPresent)
    })
  })

  it('should find take action', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.take(someActionType)
    })
    const task = sagaMiddleware.run(mock)
    store.dispatch(someAction)
    return task.done.then(() => {
      assert.isTrue(mock.takenAction(someActionType).isPresent)
      assert.isFalse(mock.takenAction(otherActionType).isPresent)
    })
  })

  it('should find call', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.call(someObj.method)
      yield effects.call(someObj.method, 1, 2)
      yield effects.call(someObj.method, 1, 3)
      yield effects.call(someObj.method, 2, 3)
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.called(someObj.method).isPresent)
      assert.equal(mock.called(someObj.method).count, 4)
      assert.isTrue(mock.calledWithArgs(someObj.method, 1).isPresent)
      assert.equal(mock.calledWithArgs(someObj.method, 1).count, 2)
      assert.equal(mock.calledWithArgs(someObj.method, 1, 2).count, 1)
      assert.isFalse(mock.calledWithArgs(someObj.method, 3).isPresent)
      assert.isTrue(mock.calledWithExactArgs(someObj.method).isPresent)
      assert.isFalse(mock.calledWithExactArgs(someObj.method, 1).isPresent)
      assert.isTrue(mock.calledWithExactArgs(someObj.method, 1, 2).isPresent)
    })
  })

  it('should find in parrallel effects', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield [
        effects.put(someAction),
        effects.put(otherAction)
      ]
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.puttedAction(someAction).isPresent)
      assert.isTrue(mock.puttedAction(otherAction).isPresent)
      assert.isFalse(mock.called(someObj.method).isPresent)
    })
  })

  it('should find in race effects', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.race({
        a: effects.put(someAction),
        b: effects.put(otherAction)
      })
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.puttedAction(someAction).isPresent)
      assert.isTrue(mock.puttedAction(otherAction).isPresent)
      assert.isFalse(mock.called(someObj.method).isPresent)
    })
  })

  it('should find in deep nested effects', () => {
    const mock = mockSaga(function * () {
      yield 'test'
      let selectEffect = effects.select(s => s.b)
      yield effects.race({
        a: [effects.put(someAction), selectEffect],
        b: [selectEffect, effects.put(otherAction)]
      })
    })
    return sagaMiddleware.run(mock).done.then(() => {
      assert.isTrue(mock.puttedAction(someAction).isPresent)
      assert.isTrue(mock.puttedAction(otherAction).isPresent)
      assert.isFalse(mock.called(someObj.method).isPresent)
    })
  })

  it('should listen effect', (done) => {
    const effect = effects.select(s => s.a)
    const mock = mockSaga(function * () {
      yield 'test'
      yield effect
    })
    mock.onEffect(effect, done)
    sagaMiddleware.run(mock)
  })

  it('should listen put action', (done) => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.put(someAction)
    })
    mock.onPuttedAction(someAction, done)
    sagaMiddleware.run(mock)
  })

  it('should listen take action', (done) => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.take(someActionType)
    })
    mock.onTakeAction(someActionType, done)
    sagaMiddleware.run(mock)
  })

  it('should listen call', (done) => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.call(someObj.method)
    })
    mock.onCall(someObj.method, done)
    sagaMiddleware.run(mock)
  })

  it('should listen call with args', (done) => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.call(someObj.method, 2, 3)
    })
    .onCallWithArgs(someObj.method, [1], () => done('invalid call [1]'))
    .onCallWithArgs(someObj.method, [2,3,4], () => done('invalid call [2,3,4]'))
    .onCallWithArgs(someObj.method, [2,3], done)
    sagaMiddleware.run(mock)
  })

  it('should listen call with exact args', (done) => {
    const mock = mockSaga(function * () {
      yield 'test'
      yield effects.call(someObj.method, 2, 3)
    })
    .onCallWithExactArgs(someObj.method, [], () => done('invalid call []'))
    .onCallWithExactArgs(someObj.method, [1], () => done('invalid call [1]'))
    .onCallWithExactArgs(someObj.method, [2], () => done('invalid call [2]'))
    .onCallWithExactArgs(someObj.method, [2,3,4], () => done('invalid call [2,3,4]'))
    .onCallWithExactArgs(someObj.method, [2,3], done)
    sagaMiddleware.run(mock)
  })

  it('test', () => {
    let flag = false;
    let obj = {
      pippo (arg) {
        return arg + 1
      }
    }
    function nodestyle (arg, cb) {
      cb(null, arg+1)
    }
    function callThrow () {
      throw new Error('error call')
    }
    function toStub (arg1, arg2) {
      return `called toStub(${arg1}, ${arg2})`
    }
    const sagas = function*() {
      let r
      // r = yield effects.put(someAction)
      //  console.log('-- result', r)
      r = yield effects.put.sync(otherAction)
      console.log('-- result', r)
      r = yield effects.call(obj.pippo, 2)
      console.log('-- result', r)

      r = yield effects.call([obj, obj.pippo], 12)
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

      r = yield Promise.resolve().then(()=> 'promessa')
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
      .stubCallWithArgs(toStub, [1, 2], () => 'stubbed (1,2)')
      .stubCall(toStub, () => 'stubbed')
    return sagaMiddleware.run(mock).done.then(() => {
      expect(flag).to.equal(true)
      expect(mock.puttedAction(otherAction).isPresent).to.be.ok
      expect(mock.puttedAction(someAction).isPresent).to.not.be.ok
      expect(mock.generatedEffect('stringa').isPresent).to.be.true
      expect(mock.generatedEffect('stringa').followedBy.takenAction(someActionType).isPresent).to.be.true
    })
  });


})
