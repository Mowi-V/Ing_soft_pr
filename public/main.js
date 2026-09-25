// 1. Incluir un listener al formulario (Según tus apuntes)
document.getElementById('formRegistro').addEventListener('submit', async function(e) {
    // 2. Prevenir que la página se recargue
    e.preventDefault();

    // 3. Leer los valores (Obtener referencias)
    const correo = document.getElementById('correo').value;
    const contrasena = document.getElementById('contrasena').value;
    const rol = document.getElementById('rol').value;

    const datosUsuario = {
        correo_electronico: correo,
        contrasena: contrasena,
        rol: rol,
        nombre: "Juan", // (Aquí tomarías los demás datos)
        apellido: "Perez",
        descripcion_perfil: "dsadsadsas",
        direccion: "sdadsadasdsadas"
    };

    try {
        // 4. Realizar un fetch con una petición POST al servidor
        // Apuntamos a la ruta que creaste en el backend
        const respuesta = await fetch('/api/usuarios/registro', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // Indicamos que enviamos JSON
            },
            body: JSON.stringify(datosUsuario) // Convertimos el objeto JS a texto JSON
        });

        // 5. Esperar la respuesta del servidor
        const resultado = await respuesta.json(); // Convertimos la respuesta JSON a objeto JS

        if (!respuesta.ok) {
            // 6. Lógica para respuestas no exitosas (Error 400 o 500)
            console.error('Error:', resultado.msg);
            alert('Error en el registro: ' + resultado.msg);
        } else {
            // 7. Lógica para respuestas exitosas (Código 201)
            console.log('Éxito:', resultado);
            alert('Registro exitoso. ¡Bienvenido!');
        }
    } catch (error) {
        console.error('Error de red:', error);
    }
});