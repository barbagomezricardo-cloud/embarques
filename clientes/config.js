/* Conexión de la App Clientes 19 Hermanos — ÚNICO archivo a editar al instalar.
   Es el mismo proyecto de Firebase de tus apps (embarques-mascotas). */
window.CLI_CFG = {
  firebase: {
    apiKey: "AIzaSyBYa3yZxWML-rwxKwuXp_gTyOTkisUKe8w",
    authDomain: "embarques-mascotas.firebaseapp.com",
    databaseURL: "https://embarques-mascotas-default-rtdb.firebaseio.com",
    projectId: "embarques-mascotas",
    messagingSenderId: "860212111367",
    appId: "1:860212111367:web:6a020f94ef6a468af922a2"
  },
  // Dirección de la función cliApi (la muestra Cloud Shell al terminar "firebase deploy").
  api: "https://us-central1-embarques-mascotas.cloudfunctions.net/cliApi",
  // Notificaciones push (opcional): Firebase → Configuración → Cloud Messaging → Certificados push web.
  vapidKey: "",
  // WhatsApp de respaldo si el vendedor no tiene número dado de alta (10 dígitos).
  waRespaldo: "",
  // Correo para solicitudes de privacidad (derechos ARCO). Vacío = "con tu vendedor o la Gerencia Comercial".
  correoPrivacidad: "",
  version: "1.0.0"
};
