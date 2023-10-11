# dojo-v2 widget library

- [Usage](#usage)

## Usage

To use the `dojo-v2` package in your project, you will need to install the package:

```bash
npm install dojo-v2
```

This package contains *all* of the widgets in this repo.

To use a widget in your application, you will need to import each widget individually:

```ts
import Button from 'dojo-v2/button';
```

Each widget module has a default export of the widget itself, as well as named exports for things such as properties specific to the widget:

```ts
import Button, { ButtonProperties } from 'dojo-v2/button';
```