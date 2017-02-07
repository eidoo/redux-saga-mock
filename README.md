# redux-saga-mock
Testing helper for [redux-saga](https://redux-saga.github.io/redux-saga/).

Make effective unit and integration tests indipendent from the real implementation of sagas.

Creates a proxy over a redux saga that allow to listen for some effect and to make complex queries on all produced effects.
It is also possible to "replace" function calls with mocked functions.

# Getting Started

## Installation

```
$ npm install --save-dev redux-saga-mock
```

## Usage example

You create a "proxied saga" calling the `mockSaga()` function on your saga. The returned saga is enhanced with with some
function useful for tests.

The saga to test:
```javascript
function * mysaga() {
    try {
      const responseObj = yield call(window.fetch, 'https://some.host/some/path', { method: 'get' })
      const jsonData = yield responseObj.json()
      if (jsonData.someField) {
        yield put({ type: 'someAction', data: jsonData.someField })
        yield call(someFunction, jsonData.someField)
      }
    } catch (err) {
      yield put({ type: 'someError', error: err })
    }
}
```

A simple test that checks the call to `someFunction` and the dispatch of the action `someAction`:
```javascript
import { runSaga } from 'redux-saga'
import { mockSaga } from 'redux-saga-mock'
import saga from './mysaga'

const MOCK_RESPONSE = {
  json: () => Promise.resolve({ field: 'some data' })
}

it('sample unit test', () => {
  const testSaga = mockSaga(saga)
  
  testSaga.stubCall(window.fetch, () => Promise.resolve(MOCK_RESPONSE))
  testSaga.stubCall(someFunction, () => {})

  return runSaga(testSaga(), {}).done
    .then(() => {
      const query = testSaga.query()
      assert.isTrue(query.callWithArgs(someFunction, 'some data').isPresent)
      assert.isTrue(query.putAction({ type: 'someAction', data: 'some data' }).isPresent)
    })
})
```

# Documentation

## Tests setup

You can test a saga with or without a real store and saga middleware. The second case is for simple unit tests.

### Setup with a store and saga middleware
This is for integration tests or tests of complex sagas. You build a real store, eventually with a working reducer, and
run the saga through the saga middleware.

```javascript
import { createStore, applyMiddleware } from 'redux'
import createSagaMiddleware from 'redux-saga'
import { mockSaga } from 'redux-saga-mock'
import saga from './mysaga'

const reducer = s => s
const initialState = {}
const MOCK_RESPONSE = {
  json: () => Promise.resolve({ field: 'some data' })
}

it('sample test', () => {
  const sagaMiddleware = createSagaMiddleware()
  const store = createStore(reducer, initialState, applyMiddleware(sagaMiddleware))
  
  const testSaga = mockSaga(saga)
  
  testSaga.stubCall(window.fetch, () => Promise.resolve(MOCK_RESPONSE))

  return sagaMiddleware.run(testSaga).done
    .then(() => {
      const query = testSaga.query()
      assert.isTrue(query.callWithArgs(someFunction, 'some data').isPresent)
      assert.isTrue(query.putAction({ type: 'someAction', data: 'some data' }).isPresent)
    })
})
```

In the above test the call to the `window.fetch` function is replaced by a stub function returning a Promise resolved with
the MOCK_RESPONSE object, simulating the behaviour of `windows.fetch`.
The function `someFunction` was not stubbed resulting in a effective call made by the saga middleware.

### Setup without store
You can run a saga without a store with the `runSaga()` function from redux-saga. This is for unit tests and you can use 
it when you can mock all effects produced by the saga that need the store. 

```javascript
import { runSaga } from 'redux-saga'
import { mockSaga } from 'redux-saga-mock'
import saga from './mysaga'

const MOCK_RESPONSE = {
  json: () => Promise.resolve({ field: 'some data' })
}

it('sample unit test', () => {
  const testSaga = mockSaga(saga)
  
  testSaga.stubCall(window.fetch, () => Promise.resolve(MOCK_RESPONSE))
  
  return runSaga(testSaga(), {}).done
    .then(() => {
      const query = testSaga.query()
      assert.isTrue(query.callWithArgs(someFunction, 'some data').isPresent)
      assert.isTrue(query.putAction({ type: 'someAction', data: 'some data' }).isPresent)
    })
})
```
Notice that `runSaga` wants a generator object and not a generator function.

If you need to provide a state to resolve a `select` effect you have to use the `getState` field of the option object in 
the `runSaga()` call, see [redux-saga documentation](https://redux-saga.github.io/redux-saga/docs/api/index.html#runsagaiterator-options).
In the same way, if you need to dispatch an action to resolve the `take` effects, you can use the `subscribe` field, 
but in this case is probably easier to use a real store.

## Queries
The `mockSaga()` call returns a "proxied saga" enhanced with a `query()` function that allow to build complex queries
on produced effects. The `query()` method returns an object representing the sequence of all produced effects, using its
methods you can filter this set to produce complex query.

Check if it was produced some effect:

`saga.query().isPresent`

Check if it was produced a take effect of _some-action_ type:

`saga.query().takeAction('some-action').isPresent`

Check it it was produced a call effect followed by a take effect:

`saga.query().call(someFunction).followedBy.takeAction('some-action').isPresent`

### Query object properties

- **count**: the number of effects
- **effects**: array of produced effects ordered by time
- **isPresent**: true if the set has some item
- **notPresent**: true if there are no effects

### Query object methods
These methods filter the set of effects resulting from the query and are chainable using the `followedBy` or `precededBy` 
properties.

- **effect(eff)**: filters all effects equal to `eff`,
- **putAction(action)**: filters all put effects matching the _action_ parameter. If _action_ is a string it indicates the 
  action type and matches al puts of actions of this type. If _action_ is an action object, only actions equal to action
  are matched.
- **takeAction(pattern)**: filters all take effects equal to the `take(pattern)` call
- **call(fn)**: filter all call effects to the _fn_ function, regardless function call parameters
- **callWithArgs(fn, ...args)**: filter all call effects to the _fn_ function with at least specified parameters
- **callWithExactArgs(fn, ...args)**: filter all call effects to the _fn_ function with exactly the specified parameters
- **number(num)**: select the effect number _num_. Example: `saga.query().call(someFn).number(2).followedBy.call(otherFn).isPresent` 
  true if _otherFn()_ is called after two calls to _someFn()_
- **first()**: select the first effect of the set. 
  Example: `saga.query().call(someFn).first().precededBy.putAction('SOME_ACTION').notPresent` true if there aren't 
  puts of SOME_ACTION type actions before calling someFn() the first time
- **last()**: select the last effect of the set

## Replace function calls
You can mock a function call providing your function to be called, the returned value is returned to the saga in place
of the original function result.
To replace a call you can use one of the following methods of the proxied saga:

- **stubCall(fn, stub)**: replace all call to _fn_, regardless of arguments, with a call to the _stub_ function.
- **stubCallWithArgs(fn, args, stub)**: replace all call to _fn_, with at least the arguments in the args array, 
  with a call to the _stub_ function.
- **stubCallWithExactArgs(fn, args, stub)**: replace all call to _fn_, with exactly the arguments in the args array, 
  with a call to the _stub_ function.
  
## Listening effects
If you want to be notified when an effect is produced you can use the following methods. These methods can be called 
providing or not providing a callback function, if the callback function is not provided a Promise is returned and it is
resolved on first matching effect produced.

 - **onEffect(effect, callback)**: notify when a matching effect is produced
 - **onTakeAction(pattern, callback)**: notify all take effects equal to the `take(pattern)` call
 - **onPutAction(action, callback)**: notify all put effects matching the _action_ parameter. If _action_ is a string 
 it indicates the action type and matches al puts of actions of this type. If _action_ is an action object, only actions 
 equal to action are matched.
 - **onCall(fn, callback)**: notify all call effects to the _fn_ function, regardless function call parameters
 - **onCallWithArgs(fn, args, callback)**: notify all call effects to the _fn_ function with at least specified parameters
 - **onCallWithExactArgs(fn, args, callback)**: filter all call effects to the _fn_ function with exactly the specified 
 parameters
 
The callback function is called with the matched effect as parameter. When testing with a store and a redux saga middleware, 
the callback function (or the promises resolutions) is called before submitting the effect to the redux saga middleware.

For integration testing purpose there are equivalent methods called after the submission of the effect to the middleware,
when the result is available and before returning it to the original saga. In this case the argument of the callback is
an object with the fields `effect` and `result`:

 - **onYieldEffect(effect, callback)**
 - **onYieldTakeAction(pattern, callback)**
 - **onYieldPutAction(action, callback)**
 - **onYieldCall(fn, callback)**
 - **onYieldCallWithArgs(fn, args, callback)**
 - **onYieldCallWithExactArgs(fn, args, callback)**



 