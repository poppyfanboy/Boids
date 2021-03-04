import * as THREE from 'three';
import { lineVsAabb } from './util/Collisions.js';
import { vectorToAabbBoundary, vectorFromAabbBoundary, mirrorInsideAABB } from './util/Aabbs.js';

const BOID_COLOR = 0x6a00db;
const BOID_SIZE = 0.08 * 1.2;

/**
 * After a boid is wrapped on the other side of the clipping AABB, it is brought
 * away from each border by this distance.
 */
const CLIPPING_EPSILON = 0.025;

/**
 * If a boid is slower than this, it does not change its direction when moving.
 */
const BOID_MIN_SPEED = 1e-6;
const BOID_MAX_SPEED = 0.35;
const BOID_MAX_FORCE = 1.5;
const BOID_MASS = 1.0;
const BOID_PERCEPTION_RADIUS = 0.3;

const boidGeometry = new THREE.ConeBufferGeometry(BOID_SIZE / 2, BOID_SIZE, 8);
const boidMaterial = new THREE.MeshPhongMaterial({
    color: BOID_COLOR,
    flatShading: true,
});

/**
 *
 * @property {THREE.Vector3} forward
 * @property {THREE.Vector3} up
 * @property {THREE.Vector3} side
 */
export class Orientation {
    /**
     * Vectors passed as arguments are *not* cloned inside the constructor.
     * Whoever calls the constructor should take care of cloning the vectors
     * if needed.
     * @param {THREE.Vector3} forward
     * @param {THREE.Vector3} up
     */
    constructor(forward, up) {
        this.forward = forward.normalize();
        this.up = up.normalize();
        this.side = forward.clone().cross(up);
    }

    /**
     * By default previous value of the up component is taken
     * as the approximation.
     * @param {THREE.Vector3} newVelocity
     * @param {THREE.Vector3} approximateUp
     */
    update(newVelocity, approximateUp) {
        this.forward.copy(newVelocity).normalize();

        if (approximateUp === undefined) {
            this.side.copy(this.forward).cross(this.up);
        } else {
            this.side.copy(this.forward).cross(approximateUp);
        }

        this.up.copy(this.forward).cross(this.side);
    }

    clone() {
        return new Orientation(this.forward, this.up);
    }
}

/**
 *
 * @property {THREE.Vector3} position
 * @property {THREE.Vector3} velocity
 * @property {Orientation} orientation
 *
 * @property {THREE.Mesh} mesh
 * @property {THREE.Box3} boundingBox
 * @property {THREE.Box3} clippingBox
 */
export class Boid {
    /**
     *
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} velocity
     * @param {Orientation} orientation
     *
     * @param {THREE.Object3D} scene
     * @param {THREE.Box3} boundingBox
     * @param {THREE.Box3} clippingBox
     */
    constructor(position, velocity, orientation, scene, boundingBox, clippingBox) {
        this.position = position;
        this.velocity = velocity;
        this.orientation = orientation;
        this.boundingBox = boundingBox;
        this.clippingBox = clippingBox;

        this.mesh = new THREE.Mesh(boidGeometry, boidMaterial);
        this.mesh.position.copy(this.position);
        this.alignWithVelocity();
        scene.add(this.mesh);
    }

    alignWithVelocity() {
        if (this.velocity.length() > BOID_MIN_SPEED) {
            this.orientation.update(this.velocity.clone());
            this.mesh.lookAt(this.position.clone().add(this.orientation.forward));
            this.mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        }
    }

    /**
     *
     * @param {Number} dt
     * @param {Array.<Boid>} boidsList
     */
    update(dt, boidsList) {
        const dtSeconds = dt * 0.001;

        // Wrap the boid on the the side in case it gets out of the clipping
        // box.
        if (
            vectorToAabbBoundary(this.position, this.clippingBox).length() > 0 &&
            !this.clippingBox.containsPoint(this.position)
        ) {
            const ray = new THREE.Ray(this.position.clone(), this.velocity.clone());
            const intersectionPoints = lineVsAabb(ray, this.clippingBox);
            const intersectionPointsCount = intersectionPoints.length;

            if (intersectionPointsCount === 0) {
                return;
            }

            this.position
                .copy(
                    intersectionPoints[intersectionPointsCount - 1].point.clamp(
                        this.clippingBox.min,
                        this.clippingBox.max
                    )
                )
                .add(vectorFromAabbBoundary(this.position, this.boundingBox, CLIPPING_EPSILON));
        }

        const steeringForce = new THREE.Vector3();

        // Avoid colliding with the bounding box (this force won't affect boids
        // traveling alongside the bounding box)
        const nextPredictedPosition = this.position.clone().add(
            this.velocity
                .clone()
                .normalize()
                .multiplyScalar(2 * BOID_PERCEPTION_RADIUS)
        );

        if (
            this.boundingBox.containsPoint(this.position) &&
            !this.boundingBox.containsPoint(nextPredictedPosition)
        ) {
            const target = mirrorInsideAABB(nextPredictedPosition, this.boundingBox);
            const desiredVelocity = target
                .clone()
                .sub(this.position)
                .normalize()
                .multiplyScalar(40 * dtSeconds);
            steeringForce.add(desiredVelocity.sub(this.velocity));
        }

        // Return inside the bounding box, if got outside
        const distanceToBoundary = vectorToAabbBoundary(this.position, this.boundingBox).length;
        const eps = 0.02;
        if (!this.boundingBox.containsPoint(this.position) || distanceToBoundary < eps) {
            const aabbCenter = new THREE.Vector3();
            this.boundingBox.getCenter(aabbCenter);

            const desiredVelocity = aabbCenter
                .sub(this.position)
                .normalize()
                .multiplyScalar(40 * dtSeconds);
            steeringForce.add(desiredVelocity.sub(this.velocity));
        }

        // Separation, cohesion, alignment
        if (this.boundingBox.containsPoint(this.position)) {
            const desiredSeparationVelocity = new THREE.Vector3();
            const neighborsCenter = new THREE.Vector3();
            const desiredAlignmentVelocity = new THREE.Vector3();

            let visibleNeighborsCount = 0;
            let closestNeighborsCount = 0;
            let neighborsCount = 0;

            for (const otherBoid of boidsList) {
                if (otherBoid === this) {
                    continue;
                }
                const directionToOther = otherBoid.position.clone().sub(this.position);
                const distanceToOther = directionToOther.length();

                if (
                    distanceToOther < BOID_PERCEPTION_RADIUS &&
                    directionToOther.angleTo(this.orientation.forward) < Math.PI / 3
                ) {
                    neighborsCenter.add(otherBoid.position);
                    visibleNeighborsCount++;
                }

                if (distanceToOther < 3 * BOID_SIZE / 2) {
                    desiredSeparationVelocity.add(
                        directionToOther
                            .normalize()
                            .divideScalar(distanceToOther)
                            .multiplyScalar(-15 * dtSeconds)
                    );

                    closestNeighborsCount++;
                }

                if (distanceToOther < BOID_PERCEPTION_RADIUS) {
                    desiredAlignmentVelocity.add(otherBoid.velocity);
                    neighborsCount++;
                }
            }

            if (closestNeighborsCount > 0) {
                steeringForce.add(desiredSeparationVelocity.sub(this.velocity));
            }

            if (visibleNeighborsCount > 0) {
                neighborsCenter.divideScalar(visibleNeighborsCount);

                steeringForce.add(
                    neighborsCenter
                        .sub(this.position)
                        .sub(this.velocity)
                        .normalize()
                        .multiplyScalar(20 * dtSeconds)
                );
            }

            if (neighborsCount > 0) {
                steeringForce.add(
                    desiredAlignmentVelocity
                        .divideScalar(neighborsCount)
                        .multiplyScalar(40 * dtSeconds)
                );
            }
        }

        // Thrust
        steeringForce.add(this.orientation.forward.clone().multiplyScalar(50 * dtSeconds));

        steeringForce.clampLength(0, BOID_MAX_FORCE);

        this.velocity
            .add(steeringForce.divideScalar(BOID_MASS).multiplyScalar(dtSeconds))
            .clampLength(0, BOID_MAX_SPEED);

        this.alignWithVelocity();

        this.position.add(this.velocity.clone().multiplyScalar(dtSeconds));
        this.mesh.position.copy(this.position);
    }
}
