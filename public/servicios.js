document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar sesión activa y rol
    const token = localStorage.getItem('x-token');
    const rol = localStorage.getItem('usuario_rol');

    if (!token) {
        alert('Debes iniciar sesión primero.');
        window.location.href = '/index.html';
        return;
    }

    // HU-006 Criterio 3: Restricción por rol en el Frontend
    if (rol !== 'P') {
        alert('Acceso denegado: Solo los Proveedores pueden registrar servicios en el catálogo.');
        window.location.href = '/dashboard.html';
        return;
    }

    // 2. Lógica para el formulario de registro de servicio
    const formRegistroServicio = document.getElementById('formRegistroServicio');
    
    if (formRegistroServicio) {
        formRegistroServicio.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorLabel = document.getElementById('mensajeErrorServicio');
            errorLabel.style.display = 'none';

            // Armar el objeto (payload) con los datos del formulario
            const payload = {
                nombre: document.getElementById('serv-nombre').value,
                categoria: document.getElementById('serv-categoria').value,
                descripcion: document.getElementById('serv-descripcion').value,
                duracion_minutos: parseInt(document.getElementById('serv-duracion').value, 10),
                precio: parseFloat(document.getElementById('serv-precio').value),
                estado: document.getElementById('serv-estado').value
            };

            try {
                // Hacer la petición POST al endpoint que creaste en el backend
                const respuesta = await fetch('/api/servicios', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-token': token // Fundamental: Enviar el JWT para superar el middleware validarJWT
                    },
                    body: JSON.stringify(payload)
                });

                const data = await respuesta.json();

                if (respuesta.status === 201) {
                    // HU-006 Criterio 1: Registro satisfactorio
                    alert('¡Servicio registrado exitosamente en tu catálogo!');
                    formRegistroServicio.reset(); // Limpiar el formulario
                    // Opcional: Redirigir al dashboard o a una lista de servicios
                    // window.location.href = '/dashboard.html';
                } else {
                    // HU-006 Criterio 2: Manejo de errores (ej. campos vacíos o rol incorrecto devueltos por el backend)
                    errorLabel.style.display = 'block';
                    errorLabel.innerText = data.msg || JSON.stringify(data.errors || data);
                }
            } catch (error) {
                console.error('Error de red:', error);
                errorLabel.style.display = 'block';
                errorLabel.innerText = 'Error de conexión con el servidor.';
            }
        });
    }
});