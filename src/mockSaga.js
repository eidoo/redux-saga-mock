import _ from 'lodash'

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

  const findEffect = (effect, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.effect(effect)), fromPos, last)
  const findPuttedAction = (action, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.putAction(action)), fromPos, last)
  const findTakenAction = (pattern, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.takeAction(pattern)), fromPos, last)
  const findCall = (fn, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.call(fn)), fromPos, last)
  const findCallWithArgs = (fn, args, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.callWithArgs(fn, args)), fromPos, last)
  const findCallWithExactArgs = (fn, args, fromPos = 0, last) => findAllIndexes(effects, recursive(matchers.callWithExactArgs(fn, args)), fromPos, last)

  function createResult (indexes) {
    const isPresent = indexes.length > 0
    const filteredEffects = indexes.map(i => effects[i])
    const count = indexes.length
    const next = isPresent ? indexes[0] + 1 : 0
    const prev = isPresent ? indexes[count - 1] - 1 : 0
    return {
      indexes,
      effects: filteredEffects,
      isPresent,
      notPresent: !isPresent,
      count,
      instance: number => createResult(number <= count ? [indexes[number]] : []),
      first: () => createResult(isPresent ? [indexes[0]] : []),
      last: () => createResult(isPresent ? [indexes[count - 1]] : []),
      followedBy: {
        effect: effect => createResult(isPresent ? findEffect(effect, next) : []),
        puttedAction: action => createResult(isPresent ? findPuttedAction(action, next) : []),
        takenAction: pattern => createResult(isPresent ? findTakenAction(pattern, next) : []),
        call: fn => createResult(isPresent ? findCall(fn, next) : []),
        callWithArgs: (fn, ...args) => createResult(isPresent ? findCallWithArgs(fn, args, next) : []),
        callWithExactArgs: (fn, ...args) => createResult(isPresent ? findCallWithExactArgs(fn, args, next) : [])
      },
      precededBy: {
        effect: effect => createResult(isPresent ? findEffect(effect, 0, prev) : []),
        puttedAction: action => createResult(isPresent ? findPuttedAction(action, 0, prev) : []),
        takenAction: pattern => createResult(isPresent ? findTakenAction(pattern, 0, prev) : []),
        call: fn => createResult(isPresent ? findCall(fn, 0, prev) : []),
        callWithArgs: (fn, ...args) => createResult(isPresent ? findCallWithArgs(fn, args, 0, prev) : []),
        callWithExactArgs: (fn, ...args) => createResult(isPresent ? findCallWithExactArgs(fn, args, 0, prev) : [])
      }
    }
  }

  function createListener (callback, matcher, ...args) {
    listeners.push({ match: matcher(...args), callback })
    return mock
  }

  function createStub (matcher, stubCreator) {
    if (!_.isFunction(stubCreator)) throw new Error('stub function required')
    stubs.push({ match: matcher, stubCreator })
    return mock
  }
  function stubCallCreator(newTargetFn) {
    return effect => {
      let cloned = _.cloneDeep(effect)
      let newEff = _.set(cloned, 'CALL.fn', newTargetFn)
      return newEff }
  }

  return Object.assign(mock, {
    allEffects: () => createResult(Array.from(effects.keys())),
    generatedEffect: (effect) => createResult(findEffect(effect)),
    puttedAction: (action) => createResult(findPuttedAction(action)),
    takenAction: (pattern) => createResult(findTakenAction(pattern)),
    called: (fn) => createResult(findCall(fn)),
    calledWithArgs: (fn, ...args) => createResult(findCallWithArgs(fn, args)),
    calledWithExactArgs: (fn, ...args) => createResult(findCallWithExactArgs(fn, args)),

    onEffect: (effect, callback) => createListener(callback, matchers.effect, effect),
    onTakeAction: (pattern, callback)  => createListener(callback, matchers.takeAction, pattern),
    onPuttedAction: (action, callback)  => createListener(callback, matchers.putAction, action),
    onCall: (fn, callback) => createListener(callback, matchers.call, fn),
    onCallWithArgs: (fn, args, callback) => createListener(callback, matchers.callWithArgs, fn, args),
    onCallWithExactArgs: (fn, args, callback) => createListener(callback, matchers.callWithExactArgs, fn, args),

    stubCall: (fn, stub) => createStub(matchers.call(fn), stubCallCreator(stub)),
    stubCallWithArgs: (fn, args, stub) => createStub(matchers.callWithArgs(fn, args), stubCallCreator(stub)),
    stubCallWithExactArgs: (fn, args, stub) => createStub(matchers.callWithExactArgs(fn, args), stubCallCreator(stub)),
  })
}
