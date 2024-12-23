import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

//render setup
const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer();
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
const rayDistance = 5;
const drawingButton = 0;
const rayCaster = new THREE.Raycaster();
const mousePosition = new THREE.Vector2();
const canvasPosition = renderer.domElement.getBoundingClientRect();  

let IsMouseDown = false;
let clickedPoint = null; 

renderer.domElement.addEventListener('mousedown', function (evt) {
    if(evt.button == drawingButton){
        IsMouseDown = true;
    }
    clickedPoint = getClicked3DPoint(evt, rayDistance, lineObjects); 
}, false);

renderer.domElement.addEventListener('mouseup', function (evt) {
    if(evt.button == drawingButton){
        IsMouseDown = false;
        ResetLineState();
    }
}, false);

renderer.domElement.addEventListener('mousemove', function (evt) {
    if (IsMouseDown) {
        clickedPoint = getClicked3DPoint(evt, rayDistance, lineObjects);
    }
}, false);

function getClicked3DPoint(evt, distance, excludeObjects) {
    evt.preventDefault();

    mousePosition.x = ((evt.clientX - canvasPosition.left) / renderer.domElement.width) * 2 - 1;
    mousePosition.y = -((evt.clientY - canvasPosition.top) / renderer.domElement.height) * 2 + 1;

    scene.traverse(function (object) {
        if (object instanceof THREE.Mesh) {
            object.updateMatrixWorld(true);
        }
    });


    rayCaster.setFromCamera(mousePosition, camera);

    const allObjects = scene.children;
    const objectsToCheck = scene.children.filter(obj => !excludeObjects.includes(obj));
    const intersects = rayCaster.intersectObjects(objectsToCheck);
     
    let clickedPoint;
    
    if(intersects.length > 0){
        clickedPoint = intersects[0].point;
        lineOrigin = clickedPoint;
    }   
    else {
        const direction = rayCaster.ray.direction.clone().normalize();

        clickedPoint = rayCaster.ray.origin.clone().add(direction.multiplyScalar(distance));
    } 

    if (lineOrigin != null) {
        const direction = rayCaster.ray.direction.clone().normalize();
        const cameraDirection = new THREE.Vector3().subVectors(rayCaster.ray.origin, camera.position).normalize();
        const adjustedDistance = cameraDirection.dot(direction) * distance;
        lineOrigin = clickedPoint;
    }

    return clickedPoint; 
}

// Drawing
function StartDrawing() {
    if (IsMouseDown && clickedPoint) {
        const geometry = new THREE.SphereGeometry(0.2);
        const material = new THREE.MeshBasicMaterial({ color: GradientColor() });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(clickedPoint);
        scene.add(sphere);
        lineObjects[lineObjects.length + 1] = sphere;
    }
}

const startColorPicker = document.getElementById('startColorPicker');
const endColorPicker = document.getElementById('endColorPicker');

function GradientColor() {
    const startColor = new THREE.Color(startColorPicker.value);  
    const endColor = new THREE.Color(endColorPicker.value); 
    const totalSteps = 200; 
    let lerpFactor = Math.min(colorIndex / totalSteps, 1);  
    const interpolatedColor = startColor.clone().lerp(endColor, lerpFactor);
    colorIndex++;

    if (colorIndex > totalSteps) {
        colorIndex = totalSteps; 
    }

    return interpolatedColor;
}

//reset each line
let colorIndex = 0;
let direction = 1
let lineObjects = [];
let lineOrigin = null;

function ResetLineState(){
    colorIndex = 0;
    direction = 1
    lineObjects = [];
    lineOrigin = null;
}

// post-processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 100);
bloomPass.threshold = 0.002;
bloomPass.strength = 0.7;
bloomPass.radius = 0;
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);



function animate(t = 0) {
  requestAnimationFrame(animate);
  composer.render(scene, camera);
  controls.update();

  if (IsMouseDown) {
    StartDrawing();
    }
}
animate();


function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', handleWindowResize, false);