import { useState, useEffect } from "react";

import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import "./ComponentsCss/PostCard.css";

import { auth, db } from "../firebase";

import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    OrderBy,
    serverTimestamp,
    onSnapshot,
    updateDoc,
    orderBy
} from "firebase/firestore";

function PostCard({ post }) {

    const [showEdit, setShowEdit] = useState(false);
    const [editTitle, setEditTitle] = useState(post.title);
    const [editDescription, setEditDescription] = useState(post.description);
    const [likes, setLikes] = useState(0);
    const [postImage, setPostImage] = useState("");
    const [liked, setLiked] = useState(false);
    const [comment, setComment] = useState("");
    const [comments, setComments] = useState([]);

    useEffect(() => {
        const unsubscribeLikes = getLikes();
        const unsubscribeComments = getComments();
        const img = localStorage.getItem("postImage_" + post.id);
        if (img) setPostImage(img);
        return () => {
            unsubscribeLikes();
            unsubscribeComments();
        };
    }, []);

    const handleDelete = async () => {
        const confirmDelete = window.confirm("Are you sure you want to delete this post?");
        if (!confirmDelete) return;
        try {
            await deleteDoc(doc(db, "posts", post.id));
            alert("Post Deleted Successfully");
        } catch (error) {
            alert(error.message);
        }
    };

    const handleUpdate = async () => {
        try {
            await updateDoc(doc(db, "posts", post.id), {
                title: editTitle,
                description: editDescription
            });
            alert("Post Updated");
            setShowEdit(false);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleComment = async () => {
        if (comment.trim() === "") return;
        await addDoc(collection(db, "comments"), {
            postId: post.id,
            userId: auth.currentUser.uid,
            username: auth.currentUser.displayName,
            photoURL: auth.currentUser.photoURL,
            comment: comment,
            createdAt: serverTimestamp()
        });
        setComment("");
    };

    const getComments = () => {
        const q = query(
            collection(db, "comments"),
            where("postId", "==", post.id),
            orderBy("createdAt", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = [];
            snapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            setComments(data);
        });
        return unsubscribe;
    };

    const handleLike = async () => {
        const q = query(
            collection(db, "likes"),
            where("postId", "==", post.id),
            where("userId", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            await addDoc(collection(db, "likes"), {
                postId: post.id,
                userId: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
        } else {
            await deleteDoc(doc(db, "likes", snapshot.docs[0].id));
        }
    };

    const getLikes = () => {
        const q = query(collection(db, "likes"), where("postId", "==", post.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setLikes(snapshot.size);
            const alreadyLiked = snapshot.docs.find(
                (item) => item.data().userId === auth.currentUser.uid
            );
            setLiked(!!alreadyLiked);
        });
        return unsubscribe;
    };

    return (
        <div className="pc-card">

            {/* ── User info ── */}
            <div className="pc-user-row">
                <div className="pc-user-left">
                    {post.photoURL ? (
                        <img
                            className="pc-avatar"
                            src={post.photoURL}
                            alt="Profile"
                            width="55"
                            height="55"
                            style={{ borderRadius: "50%", objectFit: "cover" }}
                        />
                    ) : (
                        <div className="pc-avatar-placeholder">
                            {post.username?.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="pc-user-info">
                        <h5 className="pc-username">{post.username}</h5>
                        <small className="pc-email">{post.email}</small>
                    </div>
                </div>
            </div>

            <div className="pc-divider" />

            {/* ── Content ── */}
            {post.title && <h4 className="pc-title">{post.title}</h4>}
            <p className="pc-description">{post.description}</p>

            {postImage && (
                <img
                    src={postImage}
                    alt="Post"
                    className="pc-post-image"
                    style={{ maxHeight: "400px", width: "100%", objectFit: "cover" }}
                />
            )}

            {/* ── Action buttons ── */}
            <div className="pc-actions">

                <button
                    className={`pc-btn pc-btn-like ${liked ? "pc-btn-liked" : ""}`}
                    onClick={handleLike}
                >
                    {liked ? "❤️" : "🤍"}
                    <span>{liked ? "Liked" : "Like"}</span>
                    <span className="pc-count">({likes})</span>
                </button>

                <button className="pc-btn pc-btn-share">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                    <span>Share</span>
                </button>

                {post.userId === auth.currentUser.uid && (
                    <>
                        <button
                            className="pc-btn pc-btn-edit"
                            onClick={() => setShowEdit(true)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            <span>Edit</span>
                        </button>

                        <button
                            className="pc-btn pc-btn-delete"
                            onClick={handleDelete}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                            <span>Delete</span>
                        </button>
                    </>
                )}
            </div>

            {/* ── Comments accordion ── */}
            <Accordion className="pc-accordion">
                <Accordion.Item className="pc-accordion-item" eventKey="0">
                    <Accordion.Header className="pc-accordion-header">
                        💬 Comments ({comments.length})
                    </Accordion.Header>
                    <Accordion.Body className="pc-accordion-body">

                        {comments.length === 0 && (
                            <p className="pc-no-comments">No comments yet. Be the first!</p>
                        )}

                        <div className="pc-comments-list">
                            {comments.map((item) => (
                                <div key={item.id} className="pc-comment-item">
                                    {item.photoURL ? (
                                        <img
                                            className="pc-comment-avatar"
                                            src={item.photoURL}
                                            alt="Profile"
                                            width="40"
                                            height="40"
                                            style={{ borderRadius: "50%", objectFit: "cover" }}
                                        />
                                    ) : (
                                        <div className="pc-comment-avatar-placeholder">
                                            {item.username?.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="pc-comment-content">
                                        <span className="pc-comment-username">{item.username}</span>
                                        <p className="pc-comment-text">{item.comment}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pc-comment-input-row">
                            <Form.Control
                                className="pc-comment-input"
                                type="text"
                                placeholder="Write a comment..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleComment()}
                            />
                            <button className="pc-comment-submit" onClick={handleComment}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"/>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            </button>
                        </div>

                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>

            {/* ── Edit Modal ── */}
            <Modal className="pc-modal" show={showEdit} onHide={() => setShowEdit(false)}>
                <Modal.Header className="pc-modal-header" closeButton>
                    <Modal.Title className="pc-modal-title">Edit Post</Modal.Title>
                </Modal.Header>
                <Modal.Body className="pc-modal-body">
                    <input
                        className="pc-modal-input form-control mb-3"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Post title"
                    />
                    <textarea
                        className="pc-modal-input form-control"
                        rows="5"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Post description"
                    />
                </Modal.Body>
                <Modal.Footer className="pc-modal-footer">
                    <Button variant="secondary" className="pc-modal-cancel" onClick={() => setShowEdit(false)}>
                        Cancel
                    </Button>
                    <Button className="pc-modal-save" onClick={handleUpdate}>
                        Save Changes
                    </Button>
                </Modal.Footer>
            </Modal>

        </div>
    );
}

export default PostCard;