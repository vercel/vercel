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
  content: 'Use the ↑↓ or tab to cycle between fields',
  top: 1,
  left: 2,
  style: {
    fg: 'gray'
  }
})

elements.form = blessed.form({
  parent: screen,
  width: 90,
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

elements.ccvLabel = blessed.text({
  parent: elements.cardBox,
  content: 'CCV',
  top: 6,
  style: {
    fg: 'gray'
  }
})

elements.ccvPlaceholder = blessed.text({
  parent: elements.cardBox,
  content: '***',
  style: {
    fg: 'gray'
  },
  top: 6,
  left: 10
})

elements.ccvInput = blessed.textbox({
  parent: elements.cardBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 6,
  left: 9
})

elements.expirationLabel = blessed.text({
  parent: elements.cardBox,
  content: 'Exp',
  top: 8,
  style: {
    fg: 'gray'
  }
})

elements.expirationPlaceholder = blessed.text({
  parent: elements.cardBox,
  content: 'mm / yy',
  style: {
    fg: 'gray'
  },
  top: 8,
  left: 10
})

elements.expirationInput = blessed.textbox({
  parent: elements.cardBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 8,
  left: 9
})

elements.addressBox = blessed.box({
  parent: elements.form,
  top: 11
})

elements.addressLabel = blessed.text({
  parent: elements.addressBox,
  content: 'ADDRESS',
  style: {
    fg: 'gray'
  }
})

elements.address1Label = blessed.text({
  parent: elements.addressBox,
  content: 'Line 1',
  top: 2,
  style: {
    fg: 'gray'
  }
})

elements.address1Placeholder = blessed.text({
  parent: elements.addressBox,
  content: '1 Infinite Triangle',
  style: {
    fg: 'gray'
  },
  top: 2,
  left: 10
})

elements.address1Input = blessed.textbox({
  parent: elements.addressBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 2,
  left: 9
})

elements.address2Label = blessed.text({
  parent: elements.addressBox,
  content: 'Line 2',
  top: 4,
  style: {
    fg: 'gray'
  }
})

elements.address2 = blessed.textbox({
  parent: elements.addressBox,
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
//
//
elements.cityLabel = blessed.text({
  parent: elements.addressBox,
  content: 'City',
  top: 6,
  style: {
    fg: 'gray'
  }
})

elements.cityPlaceholder = blessed.text({
  parent: elements.addressBox,
  content: 'San Francisco',
  style: {
    fg: 'gray'
  },
  top: 6,
  left: 10
})

elements.cityInput = blessed.textbox({
  parent: elements.addressBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 6,
  left: 9
})
//
//
elements.stateLabel = blessed.text({
  parent: elements.addressBox,
  content: 'State',
  top: 8,
  style: {
    fg: 'gray'
  }
})

elements.statePlaceholder = blessed.text({
  parent: elements.addressBox,
  content: 'California',
  style: {
    fg: 'gray'
  },
  top: 8,
  left: 10
})

elements.stateInput = blessed.textbox({
  parent: elements.addressBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 8,
  left: 9
})
//
//
elements.zipLabel = blessed.text({
  parent: elements.addressBox,
  content: 'ZIP',
  top: 10,
  style: {
    fg: 'gray'
  }
})

elements.zipPlaceholder = blessed.text({
  parent: elements.addressBox,
  content: '12345',
  style: {
    fg: 'gray'
  },
  top: 10,
  left: 10
})

elements.zipInput = blessed.textbox({
  parent: elements.addressBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 10,
  left: 9
})
//
//
elements.countryLabel = blessed.text({
  parent: elements.addressBox,
  content: 'Country',
  top: 11,
  style: {
    fg: 'gray'
  }
})

elements.countryPlaceholder = blessed.text({
  parent: elements.addressBox,
  content: 'United States',
  style: {
    fg: 'gray'
  },
  top: 11,
  left: 10
})

elements.CountryInput = blessed.textbox({
  parent: elements.addressBox,
  name: 'number',
  shrink: true,
  // width: 20,
  height: 1,
  inputOnFocus: true,
  keys: true,
  vi: true,
  top: 11,
  left: 9
})

let debugText

const debug = (...args) => { // eslint-disable-line no-unused-vars
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
  } else if (key.full === 'up' || key.full === 'S-tab') {
    updateState({
      focus: {
        element: elements.expirationInput,
        label: elements.expirationLabel
      },
      expirationInput: {left: getLeft(elements.expirationInput)},
      cardNumberInput: {left: getLeft(this)}
    })
  } else if (key.full === 'down' || key.full === 'tab') {
    updateState({
      focus: {
        element: elements.nameInput,
        label: elements.nameLabel
      },
      // we override the value to prevent the `tab` keystroke
      // from being added to the value
      cardNumberInput: {left: getLeft(this), value: this.value},
      nameInput: {left: getLeft(elements.nameInput)}
      // cardNumberInput:
    }, {later: true})
  } else {
    const value = this.value
    updateState({cardNumberInput: {value}}, {later: true})
  }
})

elements.nameInput.on('keypress', function (ch, key) {
  if (key.full === 'up' || key.full === 'S-tab') {
    updateState({
      focus: {
        element: elements.cardNumberInput,
        label: elements.cardNumberLabel
      },
      cardNumberInput: {left: getLeft(elements.cardNumberInput)},
      nameInput: {left: getLeft(this)}
    })
  } else if (key.full === 'down' || key.full === 'tab') {
    updateState({
      focus: {
        element: elements.ccvInput,
        label: elements.ccvLabel
      },
      // we override the value to prevent the `tab` keystroke
      // from being added to the value
      nameInput: {left: getLeft(this), value: this.value},
      ccvInput: {left: getLeft(elements.ccvInput)}
    }, {later: true})
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

elements.ccvInput.on('keypress', function (ch, key) {
  // TODO: detect the card type and modify the `4` here and
  // the amount of `*` in the placeholder
  if (key.full === 'up' || key.full === 'S-tab') {
    updateState({
      focus: {
        element: elements.nameInput,
        label: elements.nameLabel
      },
      nameInput: {left: getLeft(elements.nameInput)},
      ccvInput: {left: getLeft(this)}
    })
  } else if (key.full === 'down' || key.full === 'tab') {
    updateState({
      focus: {
        element: elements.expirationInput,
        label: elements.expirationLabel
      },
      // we override the value to prevent the `tab` keystroke
      // from being added to the value
      ccvInput: {left: getLeft(this), value: this.value},
      expirationInput: {left: getLeft(elements.expirationInput)}
    }, {later: true})
  } else if (key.full !== 'backspace' && (!NUMBERS.has(Number(key.ch)) || this.value.length > 3)) {
    updateState({ccvInput: {value: this.value}}, {later: true})
  }
})

elements.expirationInput.on('keypress', function (ch, key) {
  debug(this.value)
  if (NUMBERS.has(Number(key.ch)) && this.value.length < 7) {
    if (this.value.length === 7) {
      updateState({expirationInput: {value: this.value}}, {later: true})
    } else if (this.value.length === 1) {
      process.nextTick(() => updateState({expirationInput: {value: this.value + ' / '}}))
    }
  } else if (key.full === 'backspace') {
    if (this.value.slice(-3) === ' / ') {
      let value = this.value
      value = value.substr(0, value.length - 3)
      updateState({expirationInput: {value}})
    } else {
      persistInputValue(this, 'expirationInput')
    }
  } else if (key.full === 'up' || key.full === 'S-tab') {
    updateState({
      focus: {
        element: elements.ccvInput,
        label: elements.ccvLabel
      },
      ccvInput: {left: getLeft(elements.ccvInput)},
      expirationInput: {left: getLeft(this)}
    })
  } else if (key.full === 'down' || key.full === 'tab') {
    updateState({
      focus: {
        element: elements.cardNumberInput,
        label: elements.cardNumberLabel
      },
      // we override the value to prevent the `tab` keystroke
      // from being added to the value
      expirationInput: {left: getLeft(this), value: this.value},
      cardNumberInput: {left: getLeft(elements.cardNumberInput)}
    }, {later: true})
  } else {
    updateState({expirationInput: {value: this.value}}, {later: true})
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
