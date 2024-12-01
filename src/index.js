import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true }); // Enable antialiasing
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, 1000);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('./resources/forest_ground.jpg', () => {
    renderer.render(scene, camera);
    console.log('Texture loaded');
});
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(100, 100);

const planeSize = 1000;
const tileCount = 20;
const rareness = 2000;
const shapes = ['cube', 'sphere', 'pyramid', 'cone', 'cylinder', 'donut'];
const shapeMeshes = [];

for (let i = -tileCount / 2; i < tileCount / 2; i++) {
    for (let j = -tileCount / 2; j < tileCount / 2; j++) {
        const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
        const planeMaterial = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(i * planeSize, 0, j * planeSize);
        plane.receiveShadow = true;
        scene.add(plane);
    }
}

for (let k = 0; k < rareness; k++) {
    const shapeType = shapes[Math.floor(Math.random() * shapes.length)];
    let shapeGeometry;
    let size;
    size = Math.random() * 200;

    switch (shapeType) {
        case 'cube':
            shapeGeometry = new THREE.BoxGeometry(size, size, size);
            break;
        case 'sphere':
            shapeGeometry = new THREE.SphereGeometry(size / 2, 32, 32);
            break;
        case 'pyramid':
            shapeGeometry = new THREE.ConeGeometry(size / 2, size, 4);
            break;
        case 'cone':
            shapeGeometry = new THREE.ConeGeometry(size / 2, size, 32);
            break;
        case 'cylinder':
            shapeGeometry = new THREE.CylinderGeometry(size / 2, size / 2, size, 32);
            break;
        case 'donut':
            shapeGeometry = new THREE.TorusGeometry(size / 2, size / 8, 16, 100);
            break;
    }
    const shapeMaterial = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, side: THREE.DoubleSide });
    const shape = new THREE.Mesh(shapeGeometry, shapeMaterial);
    shape.castShadow = true;
    shape.receiveShadow = true;
    shape.position.set(
        (Math.random() - 0.5) * tileCount * planeSize,
        size / 2,
        (Math.random() - 0.5) * tileCount * planeSize
    );
    scene.add(shape);
    shapeMeshes.push(shape);
}

const geometry = new THREE.BoxGeometry(2, 2, 10);
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, visible: false });
const cube = new THREE.Mesh(geometry, material);
cube.castShadow = true;
scene.add(cube);
cube.position.set(0, 10, 0);

const loader = new GLTFLoader();
loader.load('./resources/fuselage.glb', (gltf) => {
    const airplane = gltf.scene;
    airplane.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.material.side = THREE.DoubleSide;
        }
    });
    cube.add(airplane);
    airplane.position.set(0, 0, 0);
});

camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

let velocity = new THREE.Vector3(0, 0, 0);
let angularVelocity = new THREE.Vector3(0, 0, 0);
const gravity = new THREE.Vector3(0, -9.81, 0);
let dragCoefficient = 0.005;
let liftCoefficient = 0.005;
let thrust = 20;
const rollSpeed = 1.5;
const pitchSpeed = 1.5;
const yawSpeed = 1.5;
const angularDamping = 0.99;
const brakeResistance = 2;
const groundBrakeResistance = 10;
const throttleIncrement = 0.1;
let throttle = 0;
const maxThrottle = 1;
const minThrottle = 0;
const pressedKeys = new Set();

document.addEventListener("keydown", (event) => {
    pressedKeys.add(event.key);
});

document.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.key);
});

const throttleIndicator = document.getElementById('throttle');
const speedIndicator = document.getElementById('speed');

const cameraOffset = new THREE.Vector3(0, 5, 10);

const raycaster = new THREE.Raycaster();
const directions = [
    new THREE.Vector3(1, 0, 0), // Right
    new THREE.Vector3(-1, 0, 0), // Left
    new THREE.Vector3(0, 1, 0), // Up
    new THREE.Vector3(0, -1, 0), // Down
    new THREE.Vector3(0, 0, 1), // Forward
    new THREE.Vector3(0, 0, -1) // Backward
];

const physicsObject = new THREE.Object3D();
scene.add(physicsObject);

function updateMovement(deltaTime) {
    velocity.add(gravity.clone().multiplyScalar(deltaTime));

    if (pressedKeys.has('w')) {
        throttle = Math.min(throttle + throttleIncrement * deltaTime, maxThrottle);
    }
    if (pressedKeys.has('s')) {
        throttle = Math.max(throttle - throttleIncrement * deltaTime, minThrottle);
    }
    if (pressedKeys.has('q')) {
        throttle = 0;
    }
    if (pressedKeys.has('e')) {
        throttle = 1;
    }
    if (pressedKeys.has('h')) {
        document.getElementById('help').classList.remove('hidden');
    } else {
        document.getElementById('help').classList.add('hidden');
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(physicsObject.quaternion);
    velocity.add(forward.multiplyScalar(thrust * throttle * deltaTime));

    if (pressedKeys.has('f') && physicsObject.position.y <= 0.5) {
        const brakeForce = velocity.clone().normalize().multiplyScalar(groundBrakeResistance * deltaTime);
        velocity.sub(brakeForce);

        if (velocity.length() < 0.1) {
            velocity.set(0, 0, 0);
        }
    }
    if (pressedKeys.has('r')) {
        document.location.reload();
    }
    if (pressedKeys.has('o')) {
        thrust = 1000;
        dragCoefficient = 0.001;
        liftCoefficient = 0.000001;
    }

    let angleOfAttack = forward.angleTo(velocity.clone().normalize());
    if (physicsObject.position.y <= 0.5 && pressedKeys.has('ArrowDown')) {
        angleOfAttack += 0.2;
    } else {
        angleOfAttack += 0.1;
    }

    const liftMagnitude = Math.sin(angleOfAttack) * liftCoefficient * velocity.lengthSq();
    const liftDirection = new THREE.Vector3(0, 1, 0);
    const liftForce = liftDirection.multiplyScalar(liftMagnitude);
    velocity.add(liftForce.multiplyScalar(deltaTime));

    const drag = velocity.clone().multiplyScalar(-dragCoefficient * velocity.length());
    velocity.add(drag.multiplyScalar(deltaTime));

    physicsObject.position.add(velocity.clone().multiplyScalar(deltaTime));

    if (physicsObject.position.y <= 0.5) {
        physicsObject.position.y = 0.5;
        velocity.y = 0;
    }

    let collisionDetected = false;
    for (const direction of directions) {
        raycaster.set(physicsObject.position, direction);
        const intersects = raycaster.intersectObjects(shapeMeshes, true);
        if (intersects.length > 0 && intersects[0].distance < 5) {
            collisionDetected = true;
            velocity.set(0, 0, 0);
            angularVelocity.set(0, 0, 0);
            break;
        }
    }

    if (pressedKeys.has('ArrowLeft')) {
        angularVelocity.z += rollSpeed * deltaTime;
    }
    if (pressedKeys.has('ArrowRight')) {
        angularVelocity.z -= rollSpeed * deltaTime;
    }
    if (pressedKeys.has('ArrowUp')) {
        angularVelocity.x -= pitchSpeed * deltaTime;
    }
    if (pressedKeys.has('ArrowDown')) {
        angularVelocity.x += pitchSpeed * deltaTime;
    }
    if (pressedKeys.has('a')) {
        angularVelocity.y += yawSpeed * deltaTime;
    }
    if (pressedKeys.has('d')) {
        angularVelocity.y -= yawSpeed * deltaTime;
    }

    physicsObject.rotateOnAxis(new THREE.Vector3(1, 0, 0), angularVelocity.x * deltaTime);
    physicsObject.rotateOnAxis(new THREE.Vector3(0, 1, 0), angularVelocity.y * deltaTime);
    physicsObject.rotateOnAxis(new THREE.Vector3(0, 0, 1), angularVelocity.z * deltaTime);

    angularVelocity.multiplyScalar(angularDamping);

    angularVelocity.x = THREE.MathUtils.clamp(angularVelocity.x, -Math.PI / 4, Math.PI / 4);
    angularVelocity.y = THREE.MathUtils.clamp(angularVelocity.y, -Math.PI / 4, Math.PI / 4);
    angularVelocity.z = THREE.MathUtils.clamp(angularVelocity.z, -Math.PI / 4, Math.PI / 4);

    cube.position.copy(physicsObject.position);
    cube.rotation.copy(physicsObject.rotation);

    const cameraPosition = cube.position.clone().add(cameraOffset.clone().applyQuaternion(cube.quaternion));
    camera.position.copy(cameraPosition);
    camera.lookAt(cube.position);

    directionalLight.position.set(cube.position.x + 5, cube.position.y + 10, cube.position.z + 7.5);
    directionalLight.target.position.set(cube.position.x, cube.position.y, cube.position.z);
    directionalLight.target.updateMatrixWorld();

    throttleIndicator.innerText = `Throttle: ${(throttle * 100).toFixed(0)}%`;
    speedIndicator.innerText = `Speed: ${velocity.length().toFixed(2)} m/s`;
}

let previousTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - previousTime) / 1000;
    previousTime = currentTime;

    updateMovement(deltaTime);

    renderer.render(scene, camera);
}
animate();