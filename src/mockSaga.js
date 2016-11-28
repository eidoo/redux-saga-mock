import _ from 'lodash'

const isPUT = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.PUT
const isTAKE = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.TAKE
const isCALL = (effect) => _.isObject(effect) && effect['@@redux-saga/IO'] && effect.CALL

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
    effect => isCALL(effect) && effect.CALL.fn === fn && _.isMatch(effect.CALL.args, args)
}



function findAllIndexes (array, matcher, fromPos=0) {
  const indexes = []
  for (let i=fromPos; i < array.length; i++) {
    if (matcher(array[i])) indexes.push(i)
  }
  return indexes
}

export function mockSaga (saga) {
  const GeneratorFunction = (function*(){}).constructor;
  if (!saga instanceof GeneratorFunction) throw new Error('saga must be a generator function')
  const effects = []
  const listeners = []
  const stubs = []
  const g = saga()
  const mock = function * () {
    let current = g.next()
    while (!current.done) {
      const effect = current.value
      console.log('>> effect:', effect)
      effects.push(effect)
      listeners.forEach((l) => l.match(effect) && setTimeout(l.callback))
      const stub = stubs.find((s) => s.match(effect))
      try {
        const data = stub ? stub.stub() : (yield effect)
        current = g.next(data)
      } catch (error) {
        current = g.throw(error)
      }
    }
    return current.value
  }

  const findEffect = (effect, fromPos = 0) => findAllIndexes(effects, matchers.effect(effect), fromPos)
  const findPuttedAction = (action, fromPos = 0) => findAllIndexes(effects, matchers.putAction(action), fromPos)
  const findTakenAction = (pattern, fromPos = 0) => findAllIndexes(effects, matchers.takeAction(pattern), fromPos)
  const findCall = (fn, fromPos = 0) => findAllIndexes(effects, matchers.call(fn), fromPos)
  const findCallWithArgs = (fn, args, fromPos = 0) => findAllIndexes(effects, matchers.callWithArgs(fn, args), fromPos)

  function createResult (indexes) {
    const isPresent = indexes.length > 0
    const filteredEffects = indexes.map(i => effects[i])
    const next = isPresent ? indexes[0] + 1 : 0
    const count = indexes.length
    return {
      indexes,
      effects: filteredEffects,
      isPresent,
      count,
      instance: number => createResult(number <= count ? [indexes[number]] : []),
      followedBy: {
        effect: effect => createResult(isPresent ? findEffect(effect, next) : []),
        puttedAction: action => createResult(isPresent ? findPuttedAction(action, next) : []),
        takenAction: pattern => createResult(isPresent ? findTakenAction(pattern, next) : []),
        call: fn => createResult(isPresent ? findCall(fn, next) : []),
        callWithArgs: (fn, ...args) => createResult(isPresent ? findCallWithArgs(fn, args, next) : [])
      }
    }
  }

  function createListener (callback, matcher, ...args) {
    listeners.push({ match: matcher(...args), callback })
    return mock
  }

  return Object.assign(mock, {
    generatedEffect: (effect) => createResult(findEffect(effect)),
    puttedAction: (action) => createResult(findPuttedAction(action)),
    takenAction: (pattern) => createResult(findTakenAction(pattern)),
    called: (fn) => createResult(findCall(fn)),
    calledWithArgs: (fn, ...args) => createResult(findCallWithArgs(fn, args)),

    onEffect: (effect, callback) => createListener(callback, matchers.effect, effect),
    onTakeAction: (pattern, callback)  => createListener(callback, matchers.takeAction, pattern),
    onPuttedAction: (action, callback)  => createListener(callback, matchers.putAction, action),
    onCall: (fn, callback) => createListener(callback, matchers.call, fn),
    onCallWithArgs: (fn, args, callback) => createListener(callback, matchers.callWithArgs, fn, args),
    stubCall(fn, stub){
      if (!stub) throw new Error('stub function required')
      stubs.push({ match: matchers.call(fn), stub })
      return mock
    },
    stubCallWithArgs(fn, args, stub){
      if (!stub) throw new Error('stub function required')
      stubs.push({ match: matchers.callWithArgs(fn, args), stub })
      return mock
    },
  })
}
