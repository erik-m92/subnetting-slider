# Subnetting Slider

A small, dependency-free web app for learning IPv4 subnetting. Explore subnet masks with a slider, split a network into equal subnets, and practise CIDR arithmetic with randomly generated exercises that come with hints and worked solutions.

Built with plain HTML, CSS and JavaScript. No build step, no frameworks, no network access required. The user interface is in German.

## Features

### 1 · Explore a subnet mask
- Slider from `/0` to `/32` with a 32-bit grid that colours network bits and host bits.
- Click any bit to move the network/host boundary.
- Shows the subnet mask, wildcard mask, number of addresses and usable hosts.
- Enter an example IP to see its network address, first and last host, and broadcast address.

### 2 · Split a network
- Pick a base network, a parent CIDR and a subnet CIDR, or use the quick buttons (split into 2, 4, 8, 16, 32 or 64 networks).
- Borrowed bits are highlighted in the bit grid.
- A block diagram and a table list the resulting subnets with first host, last host and broadcast.

Example: `172.16.0.0/12` split into 4 networks gives four `/14` subnets: `172.16.0.0`, `172.20.0.0`, `172.24.0.0`, `172.28.0.0`.

### 3 · Exercises
Randomly generated questions in four groups that can be switched on and off:

| Group | Question types |
|---|---|
| Splitting networks | A `/x` is split into `n` equal subnets, which CIDR results? · A `/x` is split into `/y` subnets, how many are there? · How many bits must be borrowed? |
| Hosts & size | How many usable hosts does a `/x` have? · Smallest CIDR that fits at least `n` hosts |
| Mask ↔ CIDR | Dotted-decimal mask for `/x` · CIDR for a given mask |
| Network addresses | Network address of the `k`-th subnet after a split · Which network does an IP belong to? |

Each question offers a hint, a worked solution after checking, a running score with streak, and a "show in slider" button that loads the question's values into the explorer or the split view.

Answers are parsed leniently: `/20` and `20` are both accepted for a CIDR, numbers may contain thousands separators, and network addresses may be given with or without a prefix.

### Other
- Light and dark theme follow the system setting.
- Responsive layout that works on phone widths.
- A collapsible cheat sheet summarises the four rules used throughout.

## Getting started

Open `index.html` in any modern browser. That is all.

If you prefer a local server (for example to test on a phone in the same network):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Project structure

```
index.html   page structure and the three sections
style.css    styling, light/dark theme, responsive rules
app.js       subnet math, slider and split logic, exercise generators
```

## How the math works

- **Splitting:** dividing a network into 2^k equal subnets means borrowing k bits, so the new prefix is `old + k`. Example: `/12` into 4 networks → `/14`.
- **Number of subnets:** `2^(new prefix − old prefix)`.
- **Size:** `2^(32 − prefix)` addresses; usable hosts are two fewer (network and broadcast address). `/31` has 2 usable addresses (RFC 3021) and `/32` is a single host.
- **Mask ↔ CIDR:** the prefix length is the number of leading 1 bits. A partially filled octet has the value 128, 192, 224, 240, 248, 252, 254 or 255 for 1 to 8 bits.

All calculations use plain numbers instead of bitwise operators so that values from 2^31 upwards are handled without sign issues.

## Adding a new exercise type

1. Add a generator function to `GENERATORS` in `app.js`. It returns an object with `html` (question text), `placeholder`, `isCorrect(answer)`, `answerText`, `hint`, `explain` and a `view` that tells the "show in slider" button what to load.
2. Add the generator's key to one of the groups in `TYPE_GROUPS` (or add a new group and a matching checkbox in `index.html`).
