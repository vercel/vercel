#!/usr/bin/env node

const blessed = require('blessed')

const NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 0])

// Here we store a ref to each elements that's on the screen
const blessedElements = {}

let state = {}

// updates the current state and renders it
//
// obj: an object with any info that should be
//      inserted into the state.
// later: if true, the state will be rendered
//        only at the next tick
function updateState(obj, {later = false} = {}) {
  state = Object.assign(state, obj)
  if (later) {
    process.nextTick(() => render(state))
  } else {
    render(state)
  }
}

// renders the current state of the application – similar
// to React's
function render(state) {
  Object.keys(blessedElements).map(elementName => {
    const element = blessedElements[elementName]
    Object.keys(state[elementName] || {}).map(substateName => {
      const substateValue = state[elementName][substateName]
      if (substateName === 'style') {
        for (const style in substateValue) { // eslint-disable-line guard-for-in
          element.style[style] = substateValue[style]
        }
      }
      if (substateName === 'value') {
        element.setValue(substateValue)
      } else if (substateName === 'content') {
        element.setContent(substateValue)
      }
      return null
    })
    return null
  })
  screen.render()
}

const screen = blessed.screen({
  smartCSR: true,
  ignoreLocked: ['C-c', 'escape']
})

// TODO: on `escape`, ask if the user really wants to exit/cancel
screen.key(['C-c', 'escape'], () => {
  screen.destroy()
  return process.exit(0)
})

blessed.text({
  parent: screen,
  content: 'Use the arrow keys to cycle between fields',
  top: 1,
  left: 2,
  style: {
    fg: 'gray'
  }
})

const form = blessed.form({
  parent: screen,
  width: 40,
  height: 5,
  top: 3,
  left: 2
})

blessed.text({
  parent: form,
  content: '**** **** **** ****',
  style: {
    fg: 'gray'
  }
})

const numberInput = blessed.textbox({
  parent: form,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true
})
blessedElements.numberInput = numberInput

let debugText

const debug = (...args) => {
  if (debugText) {
    args = args.map(a => JSON.stringify(a))
    debugText.setContent(args.join('\n'))
  }
}

if (process.env.NODE_ENV !== 'production') {
  debugText = blessed.text({
    parent: screen
  })
}

numberInput.on('keypress', (ch, key) => {
  debug(key.full)
  if (NUMBERS.has(Number(key.ch))) {
    if (numberInput.value.length === 19) {
      const value = numberInput.value
      updateState({numberInput: {value}}, {later: true})
      return
    }
    if ([3, 8, 13].includes(numberInput.value.length)) {
      // when the user input the last number of a 4 digit group
      // we should move the cursor to the next group

      // we need to wait for the value to be updated
      process.nextTick(() => updateState({numberInput: {value: numberInput.value + ' '}}))
    } else if ([4, 9, 14].includes(numberInput.value.length)) {
      // this will happen when the user types the first
      // digit of a 4-digit group right after removing
      // the first digit of the next group

      // here we don't use `nextTick` because we want to update
      // the input before blessed inserts the digit that the
      // user just typed
      updateState({numberInput: {value: numberInput.value + ' '}})
    }
  } else if (key.full === 'backspace') {
    // here werevert the space we added
    // to jump between one one 4-digit
    // group to another

    if (numberInput.value.slice(-1)[0] === ' ') {
      let value = numberInput.value
      value = value.substr(0, value.length - 1)
      updateState({numberInput: {value}})
    }
  } else {
    const value = numberInput.value
    updateState({numberInput: {value}}, {later: true})
  }
})

screen.render()
numberInput.focus()
