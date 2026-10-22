# Owncast

[Owncast](https://owncast.online) es un servidor de emisión en directo
autoalojado: su propio Twitch, con su chat. Esta integración lleva su Owncast a
Gladys: si está en directo, cuántas personas lo ven, el título del directo, y
escenas que reaccionan cuando un directo empieza, termina o alcanza un número
de espectadores. Las escenas también pueden escribir en el chat.

Owncast puede funcionar en casa o en un servidor alquilado: la integración
funciona con ambos (la insignia del dispositivo indica «local» o «nube» según
la dirección).

Probada con un Owncast real en Docker (versión 0.3.0, octubre de 2026), con una
carta de ajuste emitida por ffmpeg: paso a directo, espectadores, fin del
directo, estado de administración, un mensaje en el chat. Sus comentarios son
bienvenidos en [las issues](https://github.com/guim31/gladys-owncast/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Owncast accesible desde Gladys (puerto 8080 por defecto, o su
  dirección https://).
- Opcional: la contraseña de la administración de Owncast, para la tasa de bits
  y la resolución entrantes, y los espectadores cuando Owncast los oculta.
- Opcional: un token de acceso de Owncast, para escribir en el chat desde una
  escena.

## Primeros pasos

### 1. Encontrar la dirección de Owncast

Es la dirección de la página que abren sus espectadores, por ejemplo
`http://192.168.1.2:8080` o `https://live.example.org`. Una dirección copiada
del navegador también sirve (`…/admin`): la integración conserva su comienzo.

### 2. Configurar la integración

En Gladys, abra la integración y rellene:

- **Dirección de Owncast**.
- **Contraseña de administración (opcional)**: la que abre `/admin` (usuario
  `admin`). Añade dos funciones al dispositivo: tasa de bits entrante y
  resolución entrante.
- **Token de acceso (opcional)**: en Owncast, abra Admin → Integrations →
  Access Tokens, cree un token con el permiso de enviar mensajes del sistema y
  péguelo aquí. Solo para la acción «Enviar un mensaje al chat».
- **Intervalo de actualización**: 30 segundos por defecto. Una petición ligera
  cada vez (dos con la contraseña de administración).
- **Idioma de los nombres**: el idioma de los nombres de las funciones y de los
  resultados de escena.

Use después **Probar la conexión**: lee Owncast e indica si está en directo.

### 3. Añadir el dispositivo

Abra la pestaña **Descubrir** y añada el dispositivo, que lleva el nombre de su
servidor. Si introduce la contraseña de administración más tarde, la pestaña
propone actualizar el dispositivo con las dos nuevas funciones.

## El dispositivo

| Función               | Lo que indica                                                        |
| --------------------- | -------------------------------------------------------------------- |
| En directo            | Sí mientras está en directo                                          |
| Espectadores          | Personas que lo ven ahora (0 sin conexión)                           |
| Pico de espectadores  | El máximo de espectadores del directo en curso, o del último         |
| Título del directo    | El título configurado en Owncast                                     |
| Duración del directo  | Minutos desde el inicio del directo (0 sin conexión)                 |
| Tasa de bits entrante | Con la contraseña de administración: la de vídeo de su programa      |
| Resolución entrante   | Con la contraseña de administración: la resolución, p. ej. 1920×1080 |

Un directo termina cuando Owncast lleva un minuto sin conexión: si su programa
de emisión se reconecta tras un breve corte de red, el directo continúa. Una reconexión más tardía, incluso entre dos lecturas, termina el directo y empieza uno nuevo.

## Panel

El widget **Directo de Owncast** muestra el título y luego en directo o sin
conexión. En directo: los espectadores, el pico y los minutos, y con la
contraseña de administración la resolución y la tasa de bits entrantes. Sin
conexión: la duración y el pico del último directo. El botón **Actualizar** lee
Owncast al momento; el botón **Ver** abre la página del directo cuando su
dirección es https://.

## Escenas

### Disparadores

- **Empieza un directo**: con el título del directo y el nombre del servidor.
- **Termina un directo**: con el título, la duración en minutos y el pico de
  espectadores.
- **Los espectadores alcanzan un umbral**: elija 1, 5, 10, 25, 50, 100, 250,
  500 o 1000; se dispara una vez por directo cuando los espectadores lo
  alcanzan. 1 significa «alguien está mirando».

La integración guarda el inicio, el fin y los umbrales: un reinicio de Gladys
durante un directo no lo anuncia de nuevo, y un directo que terminó mientras
Gladys estaba parada se anuncia igualmente, una vez.

### Acciones

- **Estado del directo**: lee el directo para las siguientes acciones: en
  directo o no, título, espectadores, pico, duración en minutos y una frase
  lista («Mi directo: En directo, «Taller del sábado», 12 espectador(es), desde
  hace 45 min»).
- **Enviar un mensaje al chat**: publica un mensaje del sistema en el chat del
  directo. Requiere el token de acceso de la configuración.

### Ideas de escenas

- **Luz «On air»**: «Empieza un directo» pone en rojo la lámpara de la puerta
  del despacho; «Termina un directo» la apaga.
- **No molestar**: «Empieza un directo» silencia el timbre; si alguien llama de
  todos modos, «Enviar un mensaje al chat» avisa a los espectadores de que
  vuelve en 2 minutos.
- **Audiencia**: «Los espectadores alcanzan un umbral» (50) le envía una
  notificación con el título; «Termina un directo» envía la duración y el pico.

## Solución de problemas

- **Owncast no responde**: compruebe la dirección y el puerto desde la máquina
  donde funciona Gladys.
- **No hay ningún Owncast en esta dirección**: la dirección lleva a otro
  servicio, o a una subruta que no es Owncast.
- **La dirección redirige**: introduzca la dirección https://.
- **Contraseña de administración rechazada por Owncast**: introduzca la
  contraseña de `/admin`; mientras tanto el estado del directo se sigue
  leyendo.
- **Token de acceso rechazado**: vuelva a crear el token con el permiso de
  enviar mensajes del sistema.
- **Los espectadores se quedan en 0 durante el directo**: puede que Owncast
  oculte el número de espectadores (Admin → Configuration); introduzca la
  contraseña de administración para leerlo de todos modos.

## Límites

- Un solo servidor Owncast por integración.
- La duración y el pico los mide la integración; un pico entre dos lecturas
  solo lo ve el estado de administración.
- Pensada para Owncast 0.1 y posteriores; probada con la 0.3.0.
- Mientras Owncast no responde, el dispositivo conserva su último estado; un directo cortado entretanto termina en la última lectura que lo vio.
- Cuando Owncast oculta los espectadores y no hay contraseña de administración, los espectadores y el pico valen 0 en las escenas.
- Sin relación con el proyecto Owncast.
