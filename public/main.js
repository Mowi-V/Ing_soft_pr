// ==========================================
// 1. MANEJO DE RUTEO Y SESIÓN (HU-002)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('x-token');
    const path = window.location.pathname;

    // Proteger el Dashboard: Si no hay token, lo echamos al login.
    if (path.includes('dashboard.html') && !token) {
        window.location.href = '/index.html';
    }

    // Si ya está logueado y entra al index, lo mandamos al dashboard.
    if ((path === '/' || path.includes('index.html')) && token) {
        window.location.href = '/dashboard.html';
    }

    // Configurar Dashboard si estamos en él
    if (path.includes('dashboard.html')) {
        const nombre = localStorage.getItem('usuario_nombre') || 'Usuario';
        const rol = localStorage.getItem('usuario_rol') === 'P' ? 'Proveedor' : 'Cliente';
        document.getElementById('nombreUsuario').innerText = nombre;
        document.getElementById('rolUsuario').innerText = rol;
    }
});

// ==========================================
// 2. LÓGICA DE INICIO DE SESIÓN (HU-002)
// ==========================================
const formLogin = document.getElementById('formLogin');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const correo = document.getElementById('correo').value;
        const contrasena = document.getElementById('contrasena').value;
        const errorLabel = document.getElementById('mensajeError');

        try {
            const resp = await fetch('/api/usuarios/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ correo_electronico: correo, contrasena })
            });

            const data = await resp.json();

            if (resp.status === 200) {
                // Guardar credenciales
                localStorage.setItem('x-token', data.token);
                localStorage.setItem('usuario_nombre', data.usuario.nombre);
                localStorage.setItem('usuario_rol', data.usuario.rol);
                // Redirigir
                window.location.href = '/dashboard.html';
            } else {
                errorLabel.style.display = 'block';
                errorLabel.innerText = data.msg;
            }
        } catch (error) {
            console.error('Error de red:', error);
        }
    });
}

// ==========================================
// 3. LÓGICA DE REGISTRO (HU-001)
// ==========================================
const formRegistro = document.getElementById('formRegistro');
const selectRol = document.getElementById('reg-rol');

// Mostrar/Ocultar campos extra según rol seleccionado
if (selectRol) {
    selectRol.addEventListener('change', (e) => {
        document.getElementById('campo-cliente').style.display = e.target.value === 'C' ? 'block' : 'none';
        document.getElementById('campo-proveedor').style.display = e.target.value === 'P' ? 'block' : 'none';
    });
}

if (formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            nombre: document.getElementById('reg-nombre').value,
            apellido: document.getElementById('reg-apellido').value,
            correo_electronico: document.getElementById('reg-correo').value,
            contrasena: document.getElementById('reg-contrasena').value,
            rol: selectRol.value
        };

        if (payload.rol === 'C') payload.direccion = document.getElementById('reg-direccion').value;
        if (payload.rol === 'P') payload.descripcion_perfil = document.getElementById('reg-descripcion').value;

        try {
            const resp = await fetch('/api/usuarios/registro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();

            if (resp.status === 201) {
                alert('Registro exitoso. Ahora puedes iniciar sesión.');
                window.location.href = '/index.html';
            } else {
                alert('Error: ' + JSON.stringify(data));
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
}

// ==========================================
// 4. CIERRE DE SESIÓN Y PRUEBA DE PERFIL (HU-004/005)
// ==========================================
const btnCerrarSesion = document.getElementById('btnCerrarSesion');
if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/index.html';
    });
}

const btnVerPerfil = document.getElementById('btnVerPerfil');
if (btnVerPerfil) {
    btnVerPerfil.addEventListener('click', async () => {
        const token = localStorage.getItem('x-token');
        const rol = localStorage.getItem('usuario_rol');
        // Usamos la ruta correspondiente al rol para probar la HU-004 o HU-005
        const endpoint = rol === 'C' ? '/api/clientes/perfil' : '/api/proveedores/perfil';

        try {
            const resp = await fetch(endpoint, {
                method: 'GET',
                headers: { 'x-token': token } // Enviamos el token seguro
            });
            const data = await resp.json();
            
            const preContainer = document.getElementById('datosPerfil');
            preContainer.style.display = 'block';
            preContainer.innerText = JSON.stringify(data, null, 2);
        } catch (error) {
            console.error(error);
        }
    });
}