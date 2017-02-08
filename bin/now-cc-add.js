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
  const newState = Object.assign({}, state, obj)
  if (later) {
    process.nextTick(() => {
      render(state, newState)
      state = newState
    })
  } else {
    render(state, newState)
    state = newState
  }
}

// renders the current state of the application – similar
// to React's
function render(oldState, newState) {
  const futureState = Object.assign({}, oldState, newState)
  Object.keys(elements).map(elementName => {
    const element = elements[elementName]
    Object.keys(futureState[elementName] || {}).map(substateName => {
      const substateValue = futureState[elementName][substateName]
      if (substateName === 'style') {
        for (const style in substateValue) { // eslint-disable-line guard-for-in
          element.style[style] = substateValue[style]
        }
      }
      if (substateName === 'value') {
        debug(substateValue)
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

  const {focus: oldFocus} = oldState.focus ? oldState : {focus: {}}
  const {focus: newFocus} = newState
  if (newFocus) {
    if (newFocus.element && (newFocus.element !== oldFocus.element)) {
      // TODO: why `form.focusNext()` doesn't work?
      //       why `element.focus()` doesn't work
      screen.focusPop()
      screen.focusPush(newFocus.element)
    }
    if (newFocus.label && (newFocus.label !== oldFocus.label)) {
      if (oldFocus.label) {
        oldFocus.label.style.fg = 'gray'
      }
      newFocus.label.style.fg = '#fff'
      newFocus.label.style.bold = true
    }

    if (newFocus.group && (newFocus.group !== oldFocus.group)) {
      if (oldFocus.group) {
        oldFocus.group.style.fg = 'gray'
      }
      newFocus.group.style.fg = '#fff'
      newFocus.group.style.bold = true
    }
  }
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
  top: 2,
  style: {
    fg: 'gray'
  }
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

elements.nameLabel = blessed.text({
  parent: elements.cardBox,
  content: 'Name',
  top: 4,
  style: {
    fg: 'gray'
  }
})

elements.namePlaceholder = blessed.text({
  parent: elements.cardBox,
  content: 'John Appleseed',
  style: {
    fg: 'gray'
  },
  top: 4,
  left: 10
})

elements.nameInput = blessed.textbox({
  parent: elements.cardBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 4,
  left: 9
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

// inside the callback of `input.on('keypress', callback)`,
// the `this.value` will be an ond one – the keypress wasn't
// applyed to it yet. so if we want to store the value of the
// input + the keypress in the state, we need to wait for the
// next tick
function persistInputValue(input, inputName) {
  process.nextTick(() => updateState({
    [inputName]: {
      value: input.value
    }
  }))
}

// returns 9 if the input is empty and it's losing focus
// otherwise, 10
// // if `input` is focuses, it'll be assumed that it is
// losing focus
function getLeft(input) {
  debug(input.value.length)
  screen.render()
  if (input.value.length === 0 && screen.focused === input) {
    return 9
  }
  return 10
}

elements.cardNumberInput.on('keypress', function (ch, key) {
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
    } else {
      // if the keypress is valid and there's no modification
      // to be made, we just persist the value
      persistInputValue(this, 'cardNumberInput')
    }
  } else if (key.full === 'backspace') {
    // here werevert the space we added
    // to jump between one one 4-digit
    // group to another

    if (this.value.slice(-1)[0] === ' ') {
      let value = this.value
      value = value.substr(0, value.length - 1)
      updateState({cardNumberInput: {value}})
    } else {
      persistInputValue(this, 'cardNumberInput')
    }
  } else if (key.full === 'down') {
    updateState({
      focus: {
        element: elements.nameInput,
        label: elements.nameLabel
      },
      cardNumberInput: {left: getLeft(this)},
      nameInput: {left: getLeft(elements.nameInput)}
      // cardNumberInput:
    })
  } else {
    const value = this.value
    updateState({cardNumberInput: {value}}, {later: true})
  }
})

elements.nameInput.on('keypress', function (ch, key) {
  if (key.full === 'up') {
    updateState({
      focus: {
        element: elements.cardNumberInput,
        label: elements.cardNumberLabel
      },
      cardNumberInput: {left: getLeft(elements.cardNumberInput)},
      nameInput: {left: getLeft(this)}
    })
  } else {
    process.nextTick(() => {
      let content = ''
      if (this.value.length === 0) {
        content = 'John Appleseed'
      }
      updateState({
        namePlaceholder: {content}
      })
    })
  }
})

// screen.render()
// set the initial state and render it
updateState({
  focus: {
    element: elements.cardNumberInput,
    label: elements.cardNumberLabel,
    group: elements.cardDetailsLabel
  }
})
