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
4. Poné el teléfono apaisado. Al largar se toma como "centro" la posición en que lo tenés. Desde la pausa podés recentrarlo o invertir el sentido.

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
| Acelerar | GAS | ↑ / W |
| Freno delantero | DEL | ↓ / S |
| Freno trasero | TRAS | Espacio |
| Subir / bajar cambio | + / − | X / Z |
| Pausa · reiniciar · centrar giroscopio | botón ❚❚ (arriba a la derecha) | P · R · C |

## Modos

- **Carrera**: Copa monomarca en el Autódromo Las Toscas (1,63 km, 3 vueltas). Corrés contra 5 rivales con IA que llevan la misma moto que elegiste.
- **Escape**: Barrio Puerto Nuevo, una cuadrícula de 9×9 manzanas con avenidas cada 3 cuadras, calles internas, callejones, plazas y tráfico. Te persiguen hasta 3 patrulleros.
  - Mientras ninguno te ve, se llena la barra de evasión: 15 segundos sin que te vean y los perdiste.
  - Si te acorralan casi quieto, te atrapan.
  - El radar marca a los patrulleros. Titilan rojo y azul cuando te están viendo.

## Motos

| Moto | Motor | Potencia | Torque | Peso | Vel. máx. | Carácter |
| --- | --- | --- | --- | --- | --- | --- |
| Dominar 400 | 373 cc | 40 CV a 8800 | 35 Nm a 6500 | 193 kg | 148 km/h | La más rápida y la más pesada. Frenos con ABS |
| Duke 200 | 200 cc | 25 CV a 10000 | 19,3 Nm a 8000 | 159 kg | 136 km/h | Poco torque abajo. Es la más ágil y la que más se inclina |
| NZ250 | 249 cc | 24 CV a 7500 | 23 Nm a 6000 | 138 kg | 125 km/h | Liviana y pareja |
| Tornado 250 | 249 cc | 23 CV a 7500 | 24,3 Nm a 6000 | 140 kg | 128 km/h | Cubiertas de taco: se inclina menos en asfalto, pero anda en grava y pasto |

La física sale directo de la ficha de cada moto:
- **Empuje en cada marcha:** se calcula con el torque, el régimen de corte y la relación de la marcha.
- **Velocidad máxima:** aparece sola, en el punto donde la potencia se iguala con la resistencia del aire.
- **Valores aproximados:** los datos son de fábrica, más o menos. Los ajustás en `src/bikes.js`.

## Cómo se maneja

- **Inclinación y equilibrio.** El manubrio inclina la moto y es la inclinación la que la hace doblar: radio = v² / (g · tan(ángulo)). Cada moto tiene un ángulo máximo de agarre.
  - Si lo pasás, la moto patina y te caés.
  - El número en grados del tablero se pone ámbar cerca del límite y rojo encima.
  - Con el manubrio táctil a fondo, a velocidad, te pasás. Con el teclado el manubrio llega al 78 % del recorrido para que se pueda jugar.
- **Frenar o acelerar inclinado** achica ese límite:
  - el freno delantero lo baja un 34 %;
  - el trasero, un 12 %;
  - acelerar a fondo, un poco más según la moto.
- **Cuerpo.** Colgarte hacia adentro (con el giroscopio, con A/D o en modo asistido) te deja doblar más cerrado con la misma inclinación de la moto.
- **Caja manual de 6 marchas.**
  - El número de la marcha se pone azul cuando conviene subir y rojo cuando estás en el corte.
  - Si bajás un cambio a demasiada velocidad, no entra (sobregiro).
- **Caídas.**
  - Te caés si te pasás de inclinación, si frenás fuerte inclinado o si te quedás muy lento e inclinado.
  - También si le pegás de lleno al muro, a una pared, a un auto o a un patrullero.
  - Después de la caída volvés a la calle o a la pista en 1ª.
- **Sin giroscopio.** Si el teléfono no tiene sensor o no diste permiso, el cuerpo pasa a modo asistido. Esto se puede desactivar.

## Estructura

- `src/bikes.js`: las fichas de las 4 motos y lo que se deriva de ellas (empuje por marcha, resistencia, velocidad máxima).
- `src/physics.js`: la física de la moto del jugador en coordenadas de mundo. Incluye motor, caja, frenos, inclinación, límite de agarre, trayectoria y caídas.
- `src/track.js`: el trazado (Catmull-Rom), la curvatura, la proyección mundo→pista y las geometrías de pista, pianos, grava y muro.
- `src/race.js`: el modo carrera, con los rivales, los choques, las vueltas y la clasificación.
- `src/city.js`: la generación de la ciudad (manzanas, edificios, callejones, plazas), las colisiones, la línea de visión y el grafo de calles.
- `src/chase.js`: el modo escape, con el tráfico, los patrulleros (ruteo por BFS y persecución directa), la evasión y el atrapado.
- `src/TrackScene.jsx`, `src/CityScene.jsx`: los escenarios 3D.
- `src/gyro.js`: lee la gravedad (`devicemotion`) en coordenadas de pantalla para sacar la inclinación del teléfono, con calibración y zona muerta.
- `src/input.js`: el estado de los mandos y el teclado.
- `src/Hud.jsx`: el HUD mínimo (posición, vuelta, marcha, velocidad y RPM; en escritorio suma tiempos, torre y minimapa) y los controles táctiles (manubrio analógico, cambios, frenos, gas).
- `src/Scene.jsx`: el loop del juego y la cámara.
- `src/Bike.jsx`: las 4 motos paramétricas y el piloto que se cuelga en las curvas.
- `src/audio.js`: el motor monocilíndrico sintetizado según las RPM reales de cada moto y la sirena.

## Ajustes rápidos

- Motos: torque, potencia, peso, relaciones (`gearTopKmh`), ángulo máximo (`leanLimit`) y frenos en `src/bikes.js`.
- Rivales: `skill` de cada uno en `RIVALS` (`src/race.js`).
- Policía: `EVADE_TIME`, `BUST_TIME` y `vmax` de los patrulleros en `src/chase.js`.
- Sensibilidad del giroscopio: `tilt.range`, en grados para llegar a la inclinación máxima, en `src/gyro.js`.
