import React, { useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { Provider, connect } from 'react-redux';
import { usePlaidLink } from 'react-plaid-link';
import store from './redux/store';
import Menubar from './Menubar';
import Home from './Home';
import Accounts from './Accounts';
import Reports from './Reports/Reports';
import Plans from './Plans/Plans';
import { hidePlaidLink } from './redux/actions';

const Logout = () => {
    window.location.assign('/logout');

    return null;
};

const mapStateToProps = (state) => ({
    view: state.selections.view,
    showPlaidLink: state.dialogs.plaid.show,
    plaidSuccess: state.dialogs.plaid.onSuccess,
    publicToken: state.dialogs.plaid.publicToken,
});

const App = connect(mapStateToProps)(({
    view,
    showPlaidLink,
    plaidSuccess,
    publicToken,
    dispatch,
}) => {
    const onExit = useCallback((err, metaData) => {
        if (err) {
            console.log(err);
            console.log(JSON.stringify(metaData));
        }
        dispatch(hidePlaidLink());
    }, []);
    const { open, ready } = usePlaidLink({
        apiVersion: 'v2',
        clientName: process.env.APP_NAME,
        env: process.env.PLAID_ENV,
        product: process.env.PLAID_PRODUCTS.split(','),
        publicKey: process.env.PLAID_PUBLIC_KEY,
        countryCodes: process.env.PLAID_COUNTRY_CODES.split(','),
        token: publicToken,
        onSuccess: plaidSuccess,
        onExit,
    });

    useEffect(() => {
        if (open && ready && showPlaidLink) {
            open();
        }
    }, [open, showPlaidLink]);

    const renderMain = () => {
        switch (view) {
        case 'home':
            return <Home />;

        case 'accounts':
            return <Accounts />;

        case 'reports':
            return <Reports />;

        case 'plans':
            return <Plans />;

        case 'logout':
            return <Logout />;

        default:
            return <div />;
        }
    };

    return (
        <>
            <Menubar />
            <div className="main">
                {renderMain()}
            </div>
        </>
    );
});

App.propTypes = {
    view: PropTypes.string.isRequired,
    showPlaidLink: PropTypes.bool.isRequired,
    publicToken: PropTypes.string,
    dispatch: PropTypes.func.isRequired,
};

App.defaultProps = {
    publicToken: null,
};

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.querySelector('.app'),
);
