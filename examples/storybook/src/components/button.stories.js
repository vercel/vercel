import React from 'react';
import Button from './button';

export default {
  component: Button,
  title: 'Button',
};

export const text = () => <Button>Hello Button</Button>;

export const emoji = () => (
  <Button>
    <span role="img" aria-label="so cool">
      😀 😎 👍 💯
    </span>
  </Button>
);
