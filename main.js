import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { MeshLine, MeshLineMaterial } from 'three.meshline';

//render setup
const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, w / h, 1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

//simple control setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;
controls.mouseButtons = {
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
}

//handle click event
const drawingButton = 0;
const rayCaster = new THREE.Raycaster();
rayCaster.params.Line.threshold = 0.8;
rayCaster.params.Points.threshold = 0.8;
const mousePosition = new THREE.Vector2();

let isMouseDown = false;
let currentLine = null;
let currentLineMesh = null;
let currentPoints = [];
let allLinesMeshes = [];
let allLineGeometries = [];
let drawingPlane = null; // The actual plane we're drawing on (world space)

// Color pickers
const startColorPicker = document.getElementById('startColorPicker');
const endColorPicker = document.getElementById('endColorPicker');

renderer.domElement.addEventListener('mousedown', function (evt) {
    if(evt.button === drawingButton){
        isMouseDown = true;
        const result = getClicked3DPoint(evt, true); // true = establish plane
        if (result) {
            startNewLine(result.point);
            console.log('Starting line on plane at point:', result.point);
        }
    }
}, false);

renderer.domElement.addEventListener('mouseup', function (evt) {
    if(evt.button === drawingButton){
        isMouseDown = false;
        finalizeLine();
        drawingPlane = null; // Release the plane
    }
}, false);

renderer.domElement.addEventListener('mousemove', function (evt) {
    if (isMouseDown && currentLine && drawingPlane) {
        const result = getClicked3DPoint(evt, false); // false = use existing plane
        if (result) {
            addPointToCurrentLine(result.point);
        }
    }
}, false);

function findClosestPointOnLines(mouseRay) {
    let closestPoint = null;
    let closestDistance = Infinity;

    allLineGeometries.forEach(lineObj => {
        const positions = lineObj.geometry.attributes.position.array;

        // Check all vertices
        for (let i = 0; i < positions.length; i += 3) {
            const point = new THREE.Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            );

            const closestOnRay = mouseRay.closestPointToPoint(point, new THREE.Vector3());
            const distance = closestOnRay.distanceTo(point);

            if (distance < closestDistance && distance < 0.8) {
                closestDistance = distance;
                closestPoint = point;
            }
        }

        // Check line segments
        for (let i = 0; i < positions.length - 3; i += 3) {
            const p1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
            const p2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);

            const segmentDir = new THREE.Vector3().subVectors(p2, p1);
            const segmentLength = segmentDir.length();
            segmentDir.normalize();

            const rayOriginToP1 = new THREE.Vector3().subVectors(p1, mouseRay.origin);
            const t = rayOriginToP1.dot(segmentDir);
            const clampedT = Math.max(0, Math.min(segmentLength, t));

            const closestOnSegment = p1.clone().add(segmentDir.multiplyScalar(clampedT));
            const closestOnRay = mouseRay.closestPointToPoint(closestOnSegment, new THREE.Vector3());
            const distance = closestOnRay.distanceTo(closestOnSegment);

            if (distance < closestDistance && distance < 0.8) {
                closestDistance = distance;
                closestPoint = closestOnSegment;
            }
        }
    });

    return { point: closestPoint, distance: closestDistance };
}

function getClicked3DPoint(evt, establishPlane) {
    evt.preventDefault();

    const canvasPosition = renderer.domElement.getBoundingClientRect();
    mousePosition.x = ((evt.clientX - canvasPosition.left) / renderer.domElement.width) * 2 - 1;
    mousePosition.y = -((evt.clientY - canvasPosition.top) / renderer.domElement.height) * 2 + 1;

    rayCaster.setFromCamera(mousePosition, camera);

    // If establishing a new plane (starting a stroke)
    if (establishPlane) {
        // Check if we're close to an existing line
        if (allLineGeometries.length > 0) {
            const result = findClosestPointOnLines(rayCaster.ray);

            if (result.point && result.distance < Infinity) {
                const snapPoint = result.point;

                // Create plane perpendicular to camera, passing through snap point
                const cameraDirection = new THREE.Vector3();
                camera.getWorldDirection(cameraDirection);
                drawingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                    cameraDirection.clone().negate(),
                    snapPoint
                );

                hoverSphere.position.copy(snapPoint);
                hoverSphere.visible = true;

                console.log('Snapped to existing line, plane established');
                return { point: snapPoint };
            }
        }

        // No snap - create plane at default distance
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const planePoint = camera.position.clone().add(cameraDirection.multiplyScalar(5));
        drawingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            cameraDirection.clone().negate(),
            planePoint
        );

        hoverSphere.visible = false;
        console.log('New plane at default distance');
    }

    // Use the established plane (whether new or existing)
    if (drawingPlane) {
        const intersectionPoint = new THREE.Vector3();
        const intersected = rayCaster.ray.intersectPlane(drawingPlane, intersectionPoint);

        if (intersected) {
            return { point: intersectionPoint };
        }
    }

    return null;
}

function startNewLine(startPoint) {
    currentPoints = [startPoint.clone()];
    currentLine = new MeshLine();

    const material = new MeshLineMaterial({
        color: new THREE.Color(startColorPicker.value),
        opacity: 1,
        sizeAttenuation: false,
        lineWidth: 0.1,
        depthWrite: false,
        depthTest: false,
        transparent: false
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
    currentLine.setGeometry(geometry);
    currentLineMesh = new THREE.Mesh(currentLine, material);
    scene.add(currentLineMesh);
    allLinesMeshes.push(currentLineMesh);

    // Create invisible helper line for raycasting
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
    const lineMaterial = new THREE.LineBasicMaterial({ visible: false });
    const helperLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(helperLine);
    allLineGeometries.push(helperLine);
}

function addPointToCurrentLine(newPoint) {
    if (!currentLine || !currentLineMesh) return;

    const lastPoint = currentPoints[currentPoints.length - 1];
    const distance = lastPoint.distanceTo(newPoint);

    if (distance < 0.05) return;

    currentPoints.push(newPoint.clone());

    // Update MeshLine with gradient
    const material = currentLineMesh.material;
    const startColor = new THREE.Color(startColorPicker.value);
    const endColor = new THREE.Color(endColorPicker.value);
    const lerpFactor = Math.min(currentPoints.length / 200, 1);
    material.color = startColor.clone().lerp(endColor, lerpFactor);

    const geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
    currentLine.setGeometry(geometry);

    // Update helper line
    const helperLine = allLineGeometries[allLineGeometries.length - 1];
    helperLine.geometry.dispose();
    helperLine.geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
}

function finalizeLine() {
    currentLine = null;
    currentLineMesh = null;
    currentPoints = [];
}

// Hover indicator
const hoverSphereGeometry = new THREE.SphereGeometry(0.1, 16, 16);
const hoverSphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8,
    depthTest: false
});
let hoverSphere = new THREE.Mesh(hoverSphereGeometry, hoverSphereMaterial);
hoverSphere.visible = false;
scene.add(hoverSphere);

// Show hover when not drawing
renderer.domElement.addEventListener('mousemove', function (evt) {
    if (!isMouseDown) {
        const canvasPosition = renderer.domElement.getBoundingClientRect();
        mousePosition.x = ((evt.clientX - canvasPosition.left) / renderer.domElement.width) * 2 - 1;
        mousePosition.y = -((evt.clientY - canvasPosition.top) / renderer.domElement.height) * 2 + 1;

        rayCaster.setFromCamera(mousePosition, camera);

        if (allLineGeometries.length > 0) {
            const result = findClosestPointOnLines(rayCaster.ray);
            if (result.point && result.distance < Infinity) {
                hoverSphere.position.copy(result.point);
                hoverSphere.visible = true;
            } else {
                hoverSphere.visible = false;
            }
        }
    }
}, false);

// post-processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 100);
bloomPass.threshold = 0.002;
bloomPass.strength = 0.7;
bloomPass.radius = 0;
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

function animate() {
    requestAnimationFrame(animate);
    composer.render(scene, camera);
    controls.update();
}
animate();

function handleWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', handleWindowResize, false);

// Clear with C key
window.addEventListener('keydown', function(evt) {
    if (evt.key === 'c' || evt.key === 'C') {
        allLinesMeshes.forEach(mesh => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        allLineGeometries.forEach(line => {
            scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        allLinesMeshes = [];
        allLineGeometries = [];
        hoverSphere.visible = false;
        drawingPlane = null;
    }
});