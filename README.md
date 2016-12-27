# redux-saga-mock
Testing helper for redux-saga.

# Getting Started

## Installation

```
$ npm install --save-dev redux-saga-mock
```

##  Example
```javascript
function * mysaga() {
  while (true) {
     
    try {
      const responseObj = yield call(window.fetch, 'https://some.host/some/path', { method: 'get' })
      const jsonData = yield responseObj.json()
      if (response)
      const data = yield call(doSomething, response)
      
      yield put({ type: 'someAction', data })
    } catch (err) {
      
    }
  }
  
}
```

```js
import { createStore, applyMiddleware } from 'redux'
import createSagaMiddleware from 'redux-saga'
import * as effects from 'redux-saga/effects'
import { mockSaga } from 'mockSaga'
import saga from './mysaga'

const reducer = s => s

const MOCK_RESPONSE = {
  json: () => Promise.resolve({ field: 'some data' })
}

it('sample unit test', (done) => {
  const sagaMiddleware = createSagaMiddleware()
  const store = createStore(reducer, {}, applyMiddleware(sagaMiddleware))
  
  const testSaga = mockSaga(saga)
  
  testSaga.stubCall(window.fetch, () => Promise.resolve(MOCK_RESPONSE))
  
  testSaga.onPutAction('someAction', () => {
    const query = testSaga.query()
    assert.equal(query.)
    
    done()
  })
  
  sagaMiddleware.run(testSaga)
  
})

```