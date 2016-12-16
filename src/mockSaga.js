import _ from 'lodash'


export function mockSaga (saga) {
  if (Array.isArray(saga)) return mockArray(saga)
  if (saga instanceof GeneratorFunction) return mockGenerator(saga)
  if (saga.next) return mockIterator(saga)
  throw new Error('saga must be a generator function, an array or an iterator')
}

const isPUT = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.PUT
const isTAKE = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.TAKE
const isCALL = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.CALL
const isRACE = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.RACE

export const matchers = {
  putAction: (action) => _.isString(action)
    ? effect => isPUT(effect) && effect.PUT.action.type === action
    : effect => isPUT(effect) && _.isEqual(effect.PUT.action, action),
  takeAction: pattern =>
    effect => isTAKE(effect) && effect.TAKE.pattern === pattern,
  effect: effectToMatch =>
    effect => _.isEqual(effect, effectToMatch),
  call: fn =>
    effect => isCALL(effect) && effect.CALL.fn === fn,
  callWithArgs: (fn, args) =>
    effect => isCALL(effect) && effect.CALL.fn === fn && _.isMatch(effect.CALL.args, args),
  callWithExactArgs: (fn, args) =>
    effect => isCALL(effect) && effect.CALL.fn === fn && _.isEqual(effect.CALL.args, args)
}

function recursive(matcher) {
  const rmatcher = (effect) => {
    if (matcher(effect)) return true
    else if (isRACE(effect)) {
      return !!_.find(effect.RACE, rmatcher)
    } else if (_.isArray(effect)) {
      return !!effect.find(rmatcher)
    }
    return false
  }
  return rmatcher
}

function rreplace (matcher, effect, replEffCreator) {
  if (matcher(effect)) return replEffCreator(effect)
  else if (isRACE(effect)) {
    return Object.assign({}, effect, {
      RACE: _.mapValues(effect.RACE, (e) => rreplace(matcher, e, replEffCreator))
    })
  } else if (_.isArray(effect)) {
    return _.map(effect, (e) => rreplace(matcher, e, replEffCreator))
  }
  return effect
}

function findAllIndexes (array, matcher, fromPos=0, last=(array.length-1)) {
  const indexes = []
  for (let i=fromPos; i <= last; i++) {
    if (matcher(array[i])) indexes.push(i)
  }
  return indexes
}

const GeneratorFunction = (function*(){}).constructor;

function mockGenerator (saga) {
  if (!saga instanceof GeneratorFunction) throw new Error('saga must be a generator function')
  const g = saga()
  return mockIterator(g).generator
}

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
  'clearStoredEffects'
]

function mockArray (sagas) {
  if (!Array.isArray(sagas)) throw new Error('sagas must be an array')
  if (sagas.length === 0) return sagas

  const mockedArray = sagas.map(s => mockSaga(s))
  chainableMethods.forEach(name => {
    Object.defineProperty(mockedArray, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: (...args) => {
        mockedArray.forEach(s => s[name](...args))
        return mockedArray
      }
    })
  })
  const filtersMethods = createQueryMethods(() => mockedArray.map(m => m.allEffects().effects))
  _.forEach(filtersMethods, (fn, name) => {
    Object.defineProperty(mockedArray, name, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: fn
    })
  })
  return mockedArray
}

function mockIterator (g) {
  if (!g.next) throw new Error('invalid iterator')

  const effects = []
  const listeners = []
  const stubs = []

  const mockedGenerator = function * () {
    let current = g.next()
    while (!current.done) {
      const effect = current.value
      console.log('>> effect:', effect)
      effects.push(effect)
      listeners.forEach((l) => recursive(l.match)(effect) && setTimeout(l.callback))
      const stubbedEffect = stubs.reduce((seffect, stub) => rreplace(stub.match, seffect, stub.stubCreator), effect)
      try {
        const data = yield stubbedEffect
        current = g.next(data)
      } catch (error) {
        current = g.throw(error)
      }
    }
    return current.value
  }

  const mockedIterator = mockedGenerator()

  function createListener (callback, matcher, ...args) {
    listeners.push({ match: matcher(...args), callback })
    return mockedIterator
  }

  function createStub (matcher, stubCreator) {
    if (!_.isFunction(stubCreator)) throw new Error('stub function required')
    const s = { match: matcher, stubCreator }
    const pos = _.findIndex(stubs, matcher)
    if (pos !== -1) {
      stubs[pos] = s
    } else {
      stubs.push(s)
    }
    return mockedIterator
  }
  function stubCallCreator(newTargetFn) {
    return effect => {
      let cloned = _.cloneDeep(effect)
      let newEff = _.set(cloned, 'CALL.fn', newTargetFn)
      return newEff }
  }

  const filtersMethods = createQueryMethods(effects)

  const chainableMethods = {
    onEffect: (effect, callback) => createListener(callback, matchers.effect, effect),
    onTakeAction: (pattern, callback)  => createListener(callback, matchers.takeAction, pattern),
    onPuttedAction: (action, callback)  => createListener(callback, matchers.putAction, action),
    onCall: (fn, callback) => createListener(callback, matchers.call, fn),
    onCallWithArgs: (fn, args, callback) => createListener(callback, matchers.callWithArgs, fn, args),
    onCallWithExactArgs: (fn, args, callback) => createListener(callback, matchers.callWithExactArgs, fn, args),

    stubCall: (fn, stub) => createStub(matchers.call(fn), stubCallCreator(stub)),
    stubCallWithArgs: (fn, args, stub) => createStub(matchers.callWithArgs(fn, args), stubCallCreator(stub)),
    stubCallWithExactArgs: (fn, args, stub) => createStub(matchers.callWithExactArgs(fn, args), stubCallCreator(stub)),
    resetStubs: () => stubs.length = 0,
    clearStoredEffects: () => effects.length = 0
  }
  // assign methods to mockGenerator but changes returned value for chainable methods
  Object.assign(mockedGenerator,
    filtersMethods,
    _.mapValues(chainableMethods, fn => (...args) => { fn(...args); return mockedGenerator }))

  return Object.assign(mockedIterator, filtersMethods, chainableMethods, { generator: mockedGenerator })
}

function createQueryMethods (getEffects) {
  if (Array.isArray(getEffects)) {
    const effects = getEffects
    getEffects = () => effects
  }
  const findEffect = (effect, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.effect(effect)), fromPos, last)
  const findPuttedAction = (action, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.putAction(action)), fromPos, last)
  const findTakenAction = (pattern, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.takeAction(pattern)), fromPos, last)
  const findCall = (fn, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.call(fn)), fromPos, last)
  const findCallWithArgs = (fn, args, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.callWithArgs(fn, args)), fromPos, last)
  const findCallWithExactArgs = (fn, args, fromPos = 0, last) => findAllIndexes(getEffects(), recursive(matchers.callWithExactArgs(fn, args)), fromPos, last)

  function createResult (indexes) {
    const isPresent = indexes.length > 0
    const filteredEffects = indexes.map(i => getEffects()[i])
    const count = indexes.length
    const next = isPresent ? indexes[0] + 1 : 0
    const prev = isPresent ? indexes[count - 1] - 1 : 0
    const creteOrderedQueries = (from, last) => ({
      effect: effect => createResult(findEffect(effect, from, last)),
      puttedAction: action => createResult(findPuttedAction(action, from, last)),
      takenAction: pattern => createResult(findTakenAction(pattern, from, last)),
      call: fn => createResult(findCall(fn, from, last)),
      callWithArgs: (fn, ...args) => createResult(findCallWithArgs(fn, args, from, last)),
      callWithExactArgs: (fn, ...args) => createResult(findCallWithExactArgs(fn, args, from, last))
    })
    return {
      indexes,
      effects: filteredEffects,
      isPresent,
      notPresent: !isPresent,
      count,
      instance: number => createResult(number <= count ? [indexes[number]] : []),
      first: () => createResult(isPresent ? [indexes[0]] : []),
      last: () => createResult(isPresent ? [indexes[count - 1]] : []),
      followedBy: creteOrderedQueries(next),
      precededBy: creteOrderedQueries(0, prev)
    }
  }

  return {
    allEffects: () => createResult(Array.from(getEffects().keys())),
    generatedEffect: (effect) => createResult(findEffect(effect)),
    puttedAction: (action) => createResult(findPuttedAction(action)),
    takenAction: (pattern) => createResult(findTakenAction(pattern)),
    called: (fn) => createResult(findCall(fn)),
    calledWithArgs: (fn, ...args) => createResult(findCallWithArgs(fn, args)),
    calledWithExactArgs: (fn, ...args) => createResult(findCallWithExactArgs(fn, args)),
  }
}
