# Harmony Client

Electron client for peer-to-peer chat protocol _Harmony_.

Signalling server available here: [HarmonyBackend](https://github.com/ZiadAmr/HarmonyBackend)

To install, check [releases](https://github.com/Danuk77/Harmony-Front-end/releases), or build yourself using the instructions below.

## Install Dependencies

```bash
(cd node-harmonyclient/ && npm install)
(cd Harmony/ && npm install)
```

## Run

Install dependencies, then:

```bash
cd Harmony/
npm run start
```

## Build for production

Install dependencies, then:

```bash
cd Harmony/
npm run
```

Choose a target OS from the list, then

```bash
npm run build:<TARGET>
```
