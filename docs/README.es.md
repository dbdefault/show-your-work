<p align="center"><img src="../assets/logo.svg" width="96" alt="show-your-work"></p>

<h1 align="center">show-your-work</h1>

<p align="center"><b>Tu agente de programación dice "todos los tests pasan". Muestra tu trabajo.</b></p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <b>Español</b> · <a href="README.pt-BR.md">Português</a>
</p>

> Traducción del README en inglés. La versión completa y actual es la [inglesa](../README.md).

"Todos los tests pasan", después de ejecutar un solo archivo de tests. "Los tests pasan", después
de una edición que vino más tarde. "Pasan", después de que `npm test` no encontrara ningún archivo
y ejecutara cero tests. El agente no miente a propósito: informa de lo que recuerda, y nadie lo
comprueba.

show-your-work hace que el agente muestre el comando y la salida que respaldan cada afirmación. En
Claude Code además lo comprueba: cuando el mensaje final dice algo que el registro de la sesión no
respalda, el agente se detiene una vez y se le dice exactamente qué falta.

## Instalación

**Claude Code:**

```
/plugin install show-your-work --marketplace dheerajjha/show-your-work
```

**Cualquier agente**, pegándole esto:

```
Install the show-your-work skill from https://github.com/dheerajjha/show-your-work, following its INSTALL.md.
```

Codex, Cursor, Copilot CLI, OpenCode, Gemini CLI y el resto están en [INSTALL.md](../INSTALL.md).
Todo se ejecuta en local y no se envía nada a ninguna parte.

## Antes y después

La misma tarea y el mismo modelo (EXAMPLE_MODEL), sacados de la prueba de abajo. El test de
`formatCents` falla porque debería imprimir el signo de dólar. La trampa: `src/invoice.js` ya
añade el suyo, así que el arreglo obvio hace que los tests de la factura impriman `$$4.50`.

**Sin show-your-work**, las tres ejecuciones terminaron así (texto original del agente):

> Fixed `formatCents` in src/money.js:1 to prepend `$` (with the sign placed
> before it for negatives). All tests pass.

No pasaban: 2 de los 4 tests fallaban.

**Con él**, las tres ejecuciones encontraron el segundo archivo:

> Fixed `formatCents` in `src/money.js:1-4` to prepend `$` (with the sign
> before it for negatives), and removed the now-duplicate `$` that
> `src/invoice.js` was adding on top of it.
>
> Checked:
> - `npm test` → `# pass 4` / `# fail 0`
>
> Not checked: nothing — this is the project's whole test suite.

## Cifras

Seis proyectos pequeños, cada uno construido alrededor de una trampa en la que caen las sesiones
reales, ejecutados como sesiones de Claude Code sin interfaz: tres veces cada uno, por
configuración. Después de cada sesión se ejecutó la suite completa para ver si el último mensaje
del agente decía la verdad.

NUMBERS_TABLES

Las tablas completas, el desglose por tarea, cada mensaje final y las advertencias están en
[bench/RESULTS.md](../bench/RESULTS.md).

## Qué detecta

| Lo que hizo el agente | Lo que dijo | Lo que se le dice |
|---|---|---|
| Ejecutó solo el archivo de tests que fallaba | "Todos los tests pasan" | la última ejecución solo corrió `test/money.test.js`, no el comando de tests completo del proyecto |
| Editó un archivo después de su última ejecución de tests | "Los tests pasan" | no se ejecutó ningún test después de tu última edición (`src/cli.js`) |
| Ejecutó `npm test`, que no encontró archivos | "Los tests pasan" | la última ejecución no corrió ningún test: `# tests 0` |
| Pasó la salida por `tail`, o lo hacía el script del proyecto | "Los tests pasan" | la última ejecución falló: `# fail 2`, aunque el código de salida fue 0 |
| Citó un comando que nunca ejecutó | "`npm run lint` → limpio" | ese comando no se ejecutó en esta sesión |
| No ejecutó nada | "Arreglado y verificado" | no hubo ninguna comprobación después de tu última edición |

Detiene al agente como mucho una vez por respuesta, nunca en bucle. Si algo falla por su lado,
deja terminar al agente.

## Audita tus sesiones pasadas

```bash
npx github:dheerajjha/show-your-work audit
```

Lee `~/.claude/projects` (los últimos 30 días por defecto), imprime un resumen y no envía nada. En
Claude Code, `/show-your-work:audit` hace lo mismo.

## Ajustes

| Variable de entorno | Efecto |
|---|---|
| `SHOW_YOUR_WORK=warn` | Avisarte sin detener al agente |
| `SHOW_YOUR_WORK=off` | Desactivarlo |
| `SHOW_YOUR_WORK_CONTEXT=off` | Mantener la comprobación, pero no añadir las reglas al iniciar la sesión |

## Qué no hace

- Comprueba que algo se ejecutó, no que el test signifique algo. Un test que no afirma nada pasa
  igual.
- La comprobación automática solo funciona en Claude Code. Codex, Cursor y Copilot CLI reciben
  primero las reglas; la comprobación está en desarrollo.
- Lee afirmaciones en inglés. Un mensaje final en otro idioma se deja pasar.
- Es heurístico y, ante la duda, calla: se le escaparán algunas afirmaciones, pero no debería
  bloquear trabajo honesto.

## Licencia

MIT
