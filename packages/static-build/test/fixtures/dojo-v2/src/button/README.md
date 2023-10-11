# Button

Dojo's `Button` widget creates a `<button>` element


## Features

- Provides an API for valid `<button>` attributes
- Can be used to create a toggle button (i.e. a button with an on/off state)
- Provides an easy API to create a button controlling a popup

### Accessibility Features

- The basic button provides a strongly typed `type` property, as well as `disabled`
- Setting `pressed` to create a toggle button handles `aria-pressed`
- Creating a popup button with `popup` sets `aria-haspopup`, `aria-controls`, and `aria-expanded`

