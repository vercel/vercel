# Scaling path alias

#### Why This Error Occurred

You tried to use `now scale` on a path alias (`now alias -r rules.json`). 

#### Possible Ways to Fix It

Path aliases are routes to instances. Instances can be scaled independent from each other.
You can view path aliases by running `now alias ls <id>`.

Documentation for Path Aliases can be found [here](https://vercel.com/docs/features/path-aliases).
