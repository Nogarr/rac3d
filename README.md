# Rueda Libre

Carrera de motos 3D pensada para celular, hecha con React + React Three Fiber (three.js) y drei. Son tres vueltas al Autódromo Las Toscas contra cinco rivales con IA.

## Jugar en el celular (con giroscopio)

Los navegadores solo entregan el sensor de movimiento en páginas HTTPS, así que:

```bash
npm install
npm run movil
```

1. Vite muestra una URL tipo `https://192.168.x.x:5173`. Abrila en el celular, que tiene que estar en la misma red Wi-Fi que la PC.
2. Aceptá el aviso de certificado: es autofirmado, solo para desarrollo.
3. Tocá **Largar**. En iPhone aparece el pedido de permiso de movimiento y hay que aceptarlo.
4. Poné el teléfono apaisado. Al largar se toma como "centro" la posición en que lo tenés. Se puede recentrar desde el botón CENTRAR o desde la pausa, y ahí también está la opción de invertir el sentido.

Si Windows pregunta por el firewall al correr `npm run movil`, permití el acceso en redes privadas.

## Otros comandos

```bash
npm run dev          # escritorio, http://localhost:5173
npm run build        # build normal en dist/
npm run build:single # un único index.html autocontenido en dist-single/
```

## Controles

| Acción | Celular | Teclado |
| --- | --- | --- |
| Manubrio | deslizar el pulgar izquierdo sobre el manubrio | ← → |
| Cuerpo (inclinarse) | inclinar el teléfono | A / D |
| Acelerar | ACEL | ↑ / W |
| Freno delantero | DEL | ↓ / S |
| Freno trasero | TRAS | Espacio |
| Subir / bajar cambio | ▲ / ▼ | X / Z |
| Pausa · reiniciar · centrar giroscopio | botones | P · R · C |

## Cómo se maneja

- **Caja manual de 6 marchas.** La luz azul avisa el momento de subir. En rojo estás en el corte. Si bajás un cambio a demasiada velocidad, no entra (sobregiro). Con la marcha muy alta y pocas vueltas, la moto empuja poco.
- **Freno delantero.** Es el que más frena, pero si lo usás con la moto inclinada se va el tren delantero y te caés.
- **Freno trasero.** Frena menos, pero se puede usar en plena curva y además cierra un poco la trazada.
- **Cuerpo.** Inclinarse hacia adentro de la curva reduce cuánto se abre la moto. Si te inclinás hacia afuera, se abre más. En el tablero, la franja verde muestra hacia dónde conviene inclinarse.
- **Sin giroscopio.** Si el teléfono no tiene sensor o no diste permiso, el cuerpo pasa a modo asistido. Esto se puede desactivar.
- **Caídas.** Te caés por frenar con el delantero inclinado o por pegarle de lleno al muro. Después de la caída volvés a pista en 1ª.

## Estructura

- `src/track.js`: el trazado (Catmull-Rom), la curvatura y las geometrías de pista, pianos, grava y muro.
- `src/game.js`: la simulación. Incluye el motor y la caja (curva de torque, corte, freno motor), los dos frenos, la inclinación corporal, las caídas, la IA, las vueltas y la clasificación.
- `src/gyro.js`: lee la gravedad (`devicemotion`) en coordenadas de pantalla para sacar la inclinación del teléfono, con calibración y zona muerta.
- `src/input.js`: el estado de los mandos y el teclado.
- `src/Hud.jsx`: el HUD (tablero con luz de cambio, frenos, medidor de cuerpo, minimapa, torre) y los controles táctiles (manubrio analógico, cambios, frenos, acelerador).
- `src/Scene.jsx`, `src/Bike.jsx`: la escena 3D, la moto y el piloto que se cuelga en las curvas.
- `src/audio.js`: el sonido del motor con Web Audio, que sigue las RPM.

## Ajustes rápidos

- Relaciones de caja: `GEAR_TOP` y `GEAR_PUSH` en `src/game.js`.
- Dificultad: `vmax` y `grip` de cada rival en `RIDERS`.
- Sensibilidad del giroscopio: `tilt.range`, en grados para llegar a la inclinación máxima, en `src/gyro.js`.
