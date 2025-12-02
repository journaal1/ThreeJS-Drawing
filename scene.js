import * as THREE from "three";
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/addons/postprocessing/UnrealBloomPass.js";
import {MeshLine, MeshLineMaterial} from 'three.meshline';

export function initScene(container) {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    const startColor = "#f707ff";
    const endColor = "#11ff00";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({antialias: true});
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
    let drawingPlane = null;

    function getCanvasPosition() {
        return renderer.domElement.getBoundingClientRect();
    }

    function findClosestPointOnLines(mouseRay) {
        let closestPoint = null;
        let closestDistance = Infinity;

        allLineGeometries.forEach(lineObj => {
            const positions = lineObj.geometry.attributes.position.array;

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

        return {point: closestPoint, distance: closestDistance};
    }

    function getClicked3DPoint(evt, establishPlane) {
        evt.preventDefault();

        const canvasPosition = getCanvasPosition();
        mousePosition.x = ((evt.clientX - canvasPosition.left) / renderer.domElement.width) * 2 - 1;
        mousePosition.y = -((evt.clientY - canvasPosition.top) / renderer.domElement.height) * 2 + 1;

        rayCaster.setFromCamera(mousePosition, camera);

        if (establishPlane) {
            if (allLineGeometries.length > 0) {
                const result = findClosestPointOnLines(rayCaster.ray);

                if (result.point && result.distance < Infinity) {
                    const snapPoint = result.point;

                    const cameraDirection = new THREE.Vector3();
                    camera.getWorldDirection(cameraDirection);
                    drawingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                        cameraDirection.clone().negate(),
                        snapPoint
                    );

                    return {point: snapPoint};
                }
            }

            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const planePoint = camera.position.clone().add(cameraDirection.multiplyScalar(5));
            drawingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                cameraDirection.clone().negate(),
                planePoint
            );
        }

        if (drawingPlane) {
            const intersectionPoint = new THREE.Vector3();
            const intersected = rayCaster.ray.intersectPlane(drawingPlane, intersectionPoint);

            if (intersected) {
                return {point: intersectionPoint};
            }
        }

        return null;
    }

    function startNewLine(startPoint) {
        currentPoints = [startPoint.clone()];
        currentLine = new MeshLine();

        const material = new MeshLineMaterial({
            color: new THREE.Color(startColor),
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

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        const lineMaterial = new THREE.LineBasicMaterial({visible: false});
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

        const material = currentLineMesh.material;
        const start = new THREE.Color(startColor);
        const end = new THREE.Color(endColor);
        const lerpFactor = Math.min(currentPoints.length / 200, 1);
        material.color = start.clone().lerp(end, lerpFactor);

        const geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        currentLine.setGeometry(geometry);

        const helperLine = allLineGeometries[allLineGeometries.length - 1];
        helperLine.geometry.dispose();
        helperLine.geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
    }

    function finalizeLine() {
        currentLine = null;
        currentLineMesh = null;
        currentPoints = [];
    }

    function clearAllLines() {
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
        drawingPlane = null;
    }

    const onMouseDown = (evt) => {
        if (evt.button === drawingButton) {
            isMouseDown = true;
            const result = getClicked3DPoint(evt, true);
            if (result) {
                startNewLine(result.point);
            }
        }
    };

    const onMouseUp = (evt) => {
        if (evt.button === drawingButton) {
            isMouseDown = false;
            finalizeLine();
            drawingPlane = null;
        }
    };

    const onMouseMove = (evt) => {
        if (isMouseDown && currentLine && drawingPlane) {
            const result = getClicked3DPoint(evt, false);
            if (result) {
                addPointToCurrentLine(result.point);
            }
        }
    };

    const onKeyDown = (evt) => {
        if (evt.key === 'c' || evt.key === 'C') {
            clearAllLines();
        }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);

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
    }

    animate();

    function handleResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            composer.setSize(w, h);
        }
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
            window.removeEventListener('keydown', onKeyDown);

            clearAllLines();

            scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) object.material.dispose();
            });

            composer.dispose();
            renderer.dispose();
            controls.dispose();

            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        },
        clear: clearAllLines
    };
}