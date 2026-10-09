/* =====================================================================
   CONFIGURACIÓN — Sistema de Inventarios Pet Food (19 Hermanos)
   ---------------------------------------------------------------------
   Este es el ÚNICO archivo que tienes que editar para conectar el
   sistema. Mientras FIREBASE esté en null, todo corre en MODO DEMO
   (los datos viven solo en el navegador de esa computadora).
   ===================================================================== */
(typeof self !== 'undefined' ? self : window).INV_CONFIG = {

  /* 1) Firebase — tu mismo proyecto de siempre (embarques-mascotas).
        Los datos de inventarios viven en el nodo "inv" de esa base, con
        usuarios reales (Authentication) y reglas por rol.
        Para probar sin tocar datos reales abre cualquier app con ?demo=1   */
  FIREBASE: {
    apiKey: "AIzaSyBYa3yZxWML-rwxKwuXp_gTyOTkisUKe8w",
    authDomain: "embarques-mascotas.firebaseapp.com",
    databaseURL: "https://embarques-mascotas-default-rtdb.firebaseio.com",
    projectId: "embarques-mascotas",
    storageBucket: "embarques-mascotas.firebasestorage.app",
    messagingSenderId: "860212111367",
    appId: "1:860212111367:web:6a020f94ef6a468af922a2"
  },
  APPCHECK_KEY: "6Lf4vtQtAAAAABsSvrf7bax_PgYQX1TrT3j6Rmuj",

  /* 2) Licencia — tu Panel de Licencia de siempre: interruptor general
        (licencia/activa + hasta) y uno por app (licencia/apps/<id>).      */
  LICENCIA: {
    apps: { principal: "inventarios", almacen: "inventarios_almacen", produccion: "inventarios_produccion" }
  },

  /* 3) URL base de tus Cloud Functions
        (IA del master, recordatorio de las 8 am y restablecer contraseñas).
        (las mismas de tu asistente vzAsk; se agregan invAsk e invAdmin)  */
  FUNCTIONS_URL: "https://us-central1-embarques-mascotas.cloudfunctions.net",

  /* 4) Llave pública para notificaciones push (Firebase → Configuración del
        proyecto → Cloud Messaging → Certificados push web → Par de claves). */
  VAPID_KEY: "",

  EMPRESA: "Leche 19 Diecinueve Hermanos · División Pet Food"
};
