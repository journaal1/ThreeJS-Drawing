import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export function initScene(container, startColorPicker, endColorPicker) {
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.03;
    controls.mouseButtons = {
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
    };

    const rayDistance = 5;
    const drawingButton = 0;
    const rayCaster = new THREE.Raycaster();
    const mousePosition = new THREE.Vector2();

    let IsMouseDown = false;
    let clickedPoint = null;
    let colorIndex = 0;
    let lineObjects = [];
    let lineOrigin = null;

    function getCanvasPosition() {
        return renderer.domElement.getBoundingClientRect();
    }

    function ResetLineState() {
        colorIndex = 0;
        lineObjects = [];
        lineOrigin = null;
    }

    function getClicked3DPoint(evt, distance, excludeObjects) {
        evt.preventDefault();
        const canvasPosition = getCanvasPosition();

        mousePosition.x = ((evt.clientX - canvasPosition.left) / renderer.domElement.width) * 2 - 1;
        mousePosition.y = -((evt.clientY - canvasPosition.top) / renderer.domElement.height) * 2 + 1;

        rayCaster.setFromCamera(mousePosition, camera);

        let intersects;
        if (lineOrigin == null) {
            const objectsToCheck = scene.children.filter(obj => !excludeObjects.includes(obj));
            intersects = rayCaster.intersectObjects(objectsToCheck);
        }

        let clickedPoint;

        if (intersects != null && intersects.length > 0) {
            clickedPoint = intersects[0].point;
            lineOrigin = clickedPoint;
        } else {
            const direction = rayCaster.ray.direction.clone().normalize();
            clickedPoint = rayCaster.ray.origin.clone().add(direction.multiplyScalar(distance));
        }

        if (lineOrigin != null) {
            const direction = rayCaster.ray.direction.clone().normalize();
            clickedPoint = rayCaster.ray.origin.clone().add(direction.multiplyScalar(camera.position.distanceTo(lineOrigin)));
        }

        return clickedPoint;
    }

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

    function StartDrawing() {
        if (IsMouseDown && clickedPoint) {
            const geometry = new THREE.SphereGeometry(0.2);
            const material = new THREE.MeshBasicMaterial({ color: GradientColor() });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(clickedPoint);
            scene.add(sphere);
            lineObjects.push(sphere);
        }
    }

    const onMouseDown = (evt) => {
        if (evt.button === drawingButton) {
            IsMouseDown = true;
        }
        clickedPoint = getClicked3DPoint(evt, rayDistance, lineObjects);
    };

    const onMouseUp = (evt) => {
        if (evt.button === drawingButton) {
            IsMouseDown = false;
            ResetLineState();
        }
    };

    const onMouseMove = (evt) => {
        if (IsMouseDown) {
            clickedPoint = getClicked3DPoint(evt, rayDistance, lineObjects);
        }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 100);
    bloomPass.threshold = 0.002;
    bloomPass.strength = 0.7;
    bloomPass.radius = 0;
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    let animationId;

    function animate() {
        animationId = requestAnimationFrame(animate);
        composer.render(scene, camera);
        controls.update();

        if (IsMouseDown) {
            StartDrawing();
        }
    }
    animate();

    function handleResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
    }

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return {
        cleanup: () => {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();

            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            renderer.domElement.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('mousemove', onMouseMove);

            scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) object.material.dispose();
            });

            composer.dispose();
            renderer.dispose();
            controls.dispose();

            container.removeChild(renderer.domElement);
        }
    };
}