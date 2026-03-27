-- Rex compact encoding (rexc) streaming interpreter for LuaJIT.
--
-- Design goals:
-- - Evaluate directly from encoded string (no AST / no pre-parse).
-- - Keep heap allocations low (cursor-based parser, no token objects).

local bit = require 'bit'
local ffi = require 'ffi'
local byte = string.byte
local sub = string.sub

---@class Rex
local Rex = {}

---@class Rex.State
---@field src string The source code being evaluated.
---@field len integer The length of the source code.
---@field pos integer The current position in the source code.
---@field vars table<string,any> A table of variables accessible by the code.
---@field refs table<integer,any> A table of reference values accessible by the code.
---@field custom_opcodes table<integer,function>? A table of custom opcode handlers.

local DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"
---@type table<integer,integer>
local DIGIT_TO_VAL = ffi.new("int[256]")
for i = 1, #DIGITS do DIGIT_TO_VAL[byte(DIGITS, i)] = i - 1 end

---@type table<string,integer>
local OPCODES = {
  DO = 0, ADD = 1, SUB = 2, MUL = 3, DIV = 4,
  EQ = 5, NEQ = 6, LT = 7, LTE = 8, GT = 9, GTE = 10,
  AND = 11, OR = 12, XOR = 13, NOT = 14,
  BOOLEAN = 15, NUMBER = 16, STRING = 17, ARRAY = 18, OBJECT = 19,
  MOD = 20, NEG = 21,
}

--- Decodes a base-64 encoded prefix from the source string.
---@param src string
---@param start_pos integer
---@param end_pos integer
---@return integer
local function decode_prefix(src, start_pos, end_pos)
  local value = 0
  for i = start_pos, end_pos - 1 do
    local d = DIGIT_TO_VAL[byte(src, i)]
    value = value * 64 + d
  end
  return value
end

local function decode_zigzag(n)
  if (n % 2) == 0 then return n / 2 end
  return -((n + 1) / 2)
end

local function is_digit_byte(b)
  return DIGIT_TO_VAL[b] ~= nil
end

local function is_defined(v)
  return v ~= nil
end

---@param state Rex.State
local function skip_non_code(state)
  local src, pos, len = state.src, state.pos, state.len
  while pos <= len do
    local b = byte(src, pos)
    if b == 32 or b == 9 or b == 10 or b == 13 then
      pos = pos + 1
    elseif b == 47 and pos + 1 <= len and byte(src, pos + 1) == 47 then
      pos = pos + 2
      while pos <= len and byte(src, pos) ~= 10 do pos = pos + 1 end
    elseif b == 47 and pos + 1 <= len and byte(src, pos + 1) == 42 then
      pos = pos + 2
      while pos <= len do
        if byte(src, pos) == 42 and pos + 1 <= len and byte(src, pos + 1) == 47 then
          pos = pos + 2
          break
        end
        pos = pos + 1
      end
    else
      break
    end
  end
  state.pos = pos
end


local function read_prefix(state)
  local src, pos, len = state.src, state.pos, state.len
  local start_pos = pos
  while pos <= len and is_digit_byte(byte(src, pos)) do pos = pos + 1 end
  local value = decode_prefix(src, start_pos, pos)
  state.pos = pos
  return start_pos, pos, value
end

local function expect(state, ch)
  local got = sub(state.src, state.pos, state.pos)
  if got ~= ch then error("expected '" .. ch .. "' at " .. tostring(state.pos)) end
  state.pos = state.pos + 1
end

local function navigate(base, keys)
  local cur = base
  for i = 1, #keys do
    if cur == nil then return nil end
    cur = cur[keys[i]]
  end
  return cur
end

local function apply_opcode(state, id, args)
  if state.custom_opcodes and state.custom_opcodes[id] then
    return state.custom_opcodes[id](args, state)
  end
  if id == OPCODES.DO then return args[#args]
  elseif id == OPCODES.ADD then return (args[1] or 0) + (args[2] or 0)
  elseif id == OPCODES.SUB then return (args[1] or 0) - (args[2] or 0)
  elseif id == OPCODES.MUL then return (args[1] or 0) * (args[2] or 0)
  elseif id == OPCODES.DIV then return (args[1] or 0) / (args[2] or 1)
  elseif id == OPCODES.MOD then return (args[1] or 0) % (args[2] or 1)
  elseif id == OPCODES.NEG then return -(args[1] or 0)
  elseif id == OPCODES.NOT then
    local a = args[1]
    if type(a) == "boolean" then return not a end
    return bit.bnot(a or 0)
  elseif id == OPCODES.AND then
    local a, b = args[1], args[2]
    if type(a) == "boolean" or type(b) == "boolean" then return not not a and not not b end
    return bit.band(a or 0, b or 0)
  elseif id == OPCODES.OR then
    local a, b = args[1], args[2]
    if type(a) == "boolean" or type(b) == "boolean" then return not not a or not not b end
    return bit.bor(a or 0, b or 0)
  elseif id == OPCODES.XOR then
    local a, b = args[1], args[2]
    if type(a) == "boolean" or type(b) == "boolean" then return (not not a) ~= (not not b) end
    return bit.bxor(a or 0, b or 0)
  elseif id == OPCODES.EQ then return args[1] == args[2] and args[1] or nil
  elseif id == OPCODES.NEQ then return args[1] ~= args[2] and args[1] or nil
  elseif id == OPCODES.GT then return (args[1] > args[2]) and args[1] or nil
  elseif id == OPCODES.GTE then return (args[1] >= args[2]) and args[1] or nil
  elseif id == OPCODES.LT then return (args[1] < args[2]) and args[1] or nil
  elseif id == OPCODES.LTE then return (args[1] <= args[2]) and args[1] or nil
  elseif id == OPCODES.BOOLEAN then return type(args[1]) == "boolean" and args[1] or nil
  elseif id == OPCODES.NUMBER then return type(args[1]) == "number" and args[1] or nil
  elseif id == OPCODES.STRING then return type(args[1]) == "string" and args[1] or nil
  elseif id == OPCODES.ARRAY then return type(args[1]) == "table" and args[1] or nil
  elseif id == OPCODES.OBJECT then return type(args[1]) == "table" and args[1] or nil
  end
  error("unknown opcode: " .. tostring(id))
end

local eval_value -- forward declaration

local function eval_call(state)
  expect(state, "(")
  skip_non_code(state)
  if sub(state.src, state.pos, state.pos) == ")" then
    state.pos = state.pos + 1
    return nil
  end

  local callee = eval_value(state)
  local args = {}
  while true do
    skip_non_code(state)
    if sub(state.src, state.pos, state.pos) == ")" then break end
    args[#args + 1] = eval_value(state)
  end
  expect(state, ")")

  if type(callee) == "table" and callee.__opcode ~= nil then
    return apply_opcode(state, callee.__opcode, args)
  end
  return navigate(callee, args)
end

local function eval_array(state)
  expect(state, "[")
  local out = {}
  while true do
    skip_non_code(state)
    if sub(state.src, state.pos, state.pos) == "]" then break end
    out[#out + 1] = eval_value(state)
  end
  expect(state, "]")
  return out
end

local function eval_object(state)
  expect(state, "{")
  local out = {}
  while true do
    skip_non_code(state)
    if sub(state.src, state.pos, state.pos) == "}" then break end
    local key = eval_value(state)
    local value = eval_value(state)
    out[tostring(key)] = value
  end
  expect(state, "}")
  return out
end

local function eval_control(state, tag)
  state.pos = state.pos + 1
  expect(state, "(")

  if tag == "?" or tag == "!" then
    local cond = eval_value(state)
    local truth = is_defined(cond)
    if tag == "!" then truth = not truth end
    local thenv = eval_value(state)
    local elsev = nil
    skip_non_code(state)
    if sub(state.src, state.pos, state.pos) ~= ")" then elsev = eval_value(state) end
    expect(state, ")")
    if truth then return thenv end
    return elsev
  end

  if tag == "|" then
    local out = nil
    while true do
      skip_non_code(state)
      if sub(state.src, state.pos, state.pos) == ")" then break end
      local v = eval_value(state)
      if out == nil and v ~= nil then out = v end
    end
    expect(state, ")")
    return out
  end

  local out = nil
  while true do
    skip_non_code(state)
    if sub(state.src, state.pos, state.pos) == ")" then break end
    local v = eval_value(state)
    if v == nil then
      out = nil
      while true do
        skip_non_code(state)
        if sub(state.src, state.pos, state.pos) == ")" then break end
        eval_value(state)
      end
      break
    end
    out = v
  end
  expect(state, ")")
  return out
end

eval_value = function(state)
  skip_non_code(state)
  local p_start, p_end, prefix = read_prefix(state)
  local src, pos = state.src, state.pos
  local tag = sub(src, pos, pos)
  if tag == "" then error("unexpected eof") end

  if tag == "+" then
    state.pos = pos + 1
    return decode_zigzag(prefix)
  elseif tag == "*" then
    state.pos = pos + 1
    local power = decode_zigzag(prefix)
    local sig = eval_value(state)
    return sig * (10 ^ power)
  elseif tag == ":" then
    state.pos = pos + 1
    return sub(src, p_start, p_end - 1)
  elseif tag == "%" then
    state.pos = pos + 1
    return { __opcode = prefix }
  elseif tag == "@" then
    state.pos = pos + 1
    local depth = prefix + 1
    local index = #state.self_stack - depth + 1
    if index < 1 then return nil end
    return state.self_stack[index]
  elseif tag == "'" then
    state.pos = pos + 1
    return state.refs[prefix]
  elseif tag == "$" then
    state.pos = pos + 1
    return state.vars[sub(src, p_start, p_end - 1)]
  elseif tag == "," then
    state.pos = pos + 1
    local start_pos = state.pos
    local end_pos = start_pos + prefix - 1
    local value = sub(src, start_pos, end_pos)
    state.pos = end_pos + 1
    return value
  elseif tag == "(" then
    return eval_call(state)
  elseif tag == "[" then
    return eval_array(state)
  elseif tag == "{" then
    return eval_object(state)
  elseif tag == "?" or tag == "!" or tag == "|" or tag == "&" then
    return eval_control(state, tag)
  else
    error("unsupported tag in Lua interpreter: " .. tag)
  end
end

function Rex.evaluate(rexc, opts)
  opts = opts or {}
  local initial_self = opts.self
  local state = {
    src = rexc,
    len = #rexc,
    pos = 1,
    vars = opts.vars or {},
    refs = {
      [0] = opts.refs and opts.refs[0] or nil,
      [1] = true,
      [2] = false,
      [3] = nil,
      [4] = nil,
    },
    self_stack = { initial_self },
    custom_opcodes = opts.opcodes,
  }
  if opts.refs then
    for k, v in pairs(opts.refs) do state.refs[k] = v end
  end
  local value = eval_value(state)
  return value, state
end

return Rex
