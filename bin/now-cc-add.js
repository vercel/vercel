#!/usr/bin/env node

const blessed = require('blessed')

const NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 0])

// Here we store a ref to each elements that's on the screen
const elements = {}

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
  Object.keys(elements).map(elementName => {
    const element = elements[elementName]
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
      } else {
        element[substateName] = substateValue
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

elements.instuctions = blessed.text({
  parent: screen,
  content: 'Use the arrow keys to cycle between fields',
  top: 1,
  left: 2,
  style: {
    fg: 'gray'
  }
})

elements.form = blessed.form({
  parent: screen,
  width: 90,
  height: 5,
  top: 3,
  left: 2
})

elements.cardBox = blessed.box({
  parent: elements.form
})

elements.cardDetailsLabel = blessed.text({
  parent: elements.cardBox,
  content: 'CARD DETAILS'
})

elements.cardNumberLabel = blessed.text({
  parent: elements.cardBox,
  content: 'Number',
  top: 2
})

blessed.text({
  parent: elements.cardBox,
  content: '**** **** **** ****',
  style: {
    fg: 'gray'
  },
  top: 2,
  left: 10
})

elements.cardNumberInput = blessed.textbox({
  parent: elements.cardBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 2,
  left: 10
})

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

elements.cardNumberInput.on('keypress', function (ch, key) {
  debug(key.full)
  if (NUMBERS.has(Number(key.ch))) {
    if (this.value.length === 19) {
      const value = this.value
      updateState({cardNumberInput: {value}}, {later: true})
      return
    }
    if ([3, 8, 13].includes(this.value.length)) {
      // when the user input the last number of a 4 digit group
      // we should move the cursor to the next group

      // we need to wait for the value to be updated
      process.nextTick(() => updateState({cardNumberInput: {value: this.value + ' '}}))
    } else if ([4, 9, 14].includes(this.value.length)) {
      // this will happen when the user types the first
      // digit of a 4-digit group right after removing
      // the first digit of the next group

      // here we don't use `nextTick` because we want to update
      // the input before blessed inserts the digit that the
      // user just typed
      updateState({cardNumberInput: {value: this.value + ' '}})
    }
  } else if (key.full === 'backspace') {
    // here werevert the space we added
    // to jump between one one 4-digit
    // group to another

    if (this.value.slice(-1)[0] === ' ') {
      let value = this.value
      value = value.substr(0, value.length - 1)
      updateState({cardNumberInput: {value}})
    }
  } else {
    const value = this.value
    updateState({cardNumberInput: {value}}, {later: true})
  }
})

screen.render()
elements.cardNumberInput.focus()
