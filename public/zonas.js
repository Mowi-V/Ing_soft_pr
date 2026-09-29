document.addEventListener('DOMContentLoaded', () => {
    // 1. Validar la sesión y el rol (HU-005 - Criterio 5)
    const token = localStorage.getItem('x-token');
    const rol = localStorage.getItem('usuario_rol');

    if (!token) {
        alert('Debes iniciar sesión primero.');
        window.location.href = '/index.html';
        return;
    }

    // Solo los proveedores pueden registrar zonas de atención
    if (rol !== 'P') {
        alert('Acceso denegado: Solo los Proveedores pueden registrar zonas de atención.');
        window.location.href = '/dashboard.html';
        return;
    }

    // 2. Manejo del formulario
    const formRegistroZona = document.getElementById('formRegistroZona');
    const errorLabel = document.getElementById('mensajeErrorZona');
    const exitoLabel = document.getElementById('mensajeExitoZona');
    
    if (formRegistroZona) {
        formRegistroZona.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorLabel.style.display = 'none';
            exitoLabel.style.display = 'none';

            // Armar el payload
            const payload = {
                ciudad: document.getElementById('zona-ciudad').value,
                barrio_sector: document.getElementById('zona-barrio').value
            };

            try {
                // Hacer la petición POST al endpoint del backend
                const respuesta = await fetch('/api/proveedores/zonas', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-token': token // Se adjunta el token JWT por seguridad
                    },
                    body: JSON.stringify(payload)
                });

                const data = await respuesta.json();

                if (respuesta.status === 201) {
                    // Mostrar mensaje de éxito y limpiar formulario (HU-005 Criterio 3)
                    exitoLabel.style.display = 'block';
                    exitoLabel.innerText = '¡Zona registrada exitosamente!';
                    formRegistroZona.reset();
                    
                    // Ocultar mensaje de éxito después de 3 segundos
                    setTimeout(() => {
                        exitoLabel.style.display = 'none';
                    }, 3000);
                } else {
                    // Mostrar errores devueltos por los validadores del backend
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