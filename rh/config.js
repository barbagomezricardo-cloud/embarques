/* =====================================================================
   CONFIGURACIÓN — Recursos Humanos 19 Hermanos (Pet Food)
   ---------------------------------------------------------------------
   Este es el ÚNICO archivo que tienes que editar para conectar el
   sistema. Mientras FIREBASE esté en null, todo corre en MODO DEMO
   (los datos viven solo en el navegador de esa computadora).
   Para probar sin tocar datos reales abre cualquier app con ?demo=1
   ===================================================================== */
(typeof self !== 'undefined' ? self : window).RH_CONFIG = {

  /* 1) Firebase — tu mismo proyecto de siempre (embarques-mascotas).
        Los datos de RH viven en el nodo "rh" de esa base, con usuarios
        reales (Authentication) y reglas por rol.                       */
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
    apps: { principal: "rh", checador: "rh_checador", empleado: "rh_empleado" }
  },

  /* 3) URL base de tus Cloud Functions (IA del master, alta masiva de
        accesos de empleados, restablecer NIP y puente con Odoo).        */
  FUNCTIONS_URL: "https://us-central1-embarques-mascotas.cloudfunctions.net",

  EMPRESA: "Leche 19 Diecinueve Hermanos · División Pet Food",
  ZONA: "America/Mexico_City"
};
